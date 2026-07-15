import axios from 'axios';
import https from 'https';
import { IntegrationAdapter, IntegrationConfig, TestResult } from '../IntegrationAdapter';

/**
 * Sapo POS adapter.
 * Credentials required: accessToken, storeDomain (e.g. "myshop" for myshop.mysapo.net)
 * Auth: OAuth2 — access_token lấy từ SAPO Admin, gửi qua header X-Sapo-Access-Token
 * Docs: https://support.sapo.vn/gioi-thieu-api
 */
export class SapoAdapter extends IntegrationAdapter {
  readonly type = 'sapo';
  readonly name = 'Sapo';

  constructor(config: IntegrationConfig) {
    super(config);
  }

  private getBaseUrl(): string {
    const { storeDomain } = this.config.credentials;
    if (!storeDomain) throw new Error('Thiếu storeDomain (tên store Sapo)');
    return `https://${storeDomain}.mysapo.net`;
  }

  private getHeaders() {
    const { accessToken, apiKey, apiSecret } = this.config.credentials;
    
    // Nếu dùng API Key + API Secret (Basic Auth cho Private App)
    if (apiKey && apiSecret) {
      const rawToken = `${apiKey.trim()}:${apiSecret.trim()}`;
      const base64Token = Buffer.from(rawToken).toString('base64');
      return {
        'Authorization': `Basic ${base64Token}`,
        'Content-Type': 'application/json',
      };
    }

    // Nếu dùng Access Token (OAuth / Public App)
    if (accessToken) {
      return {
        'X-Sapo-Access-Token': accessToken.trim(),
        'Content-Type': 'application/json',
      };
    }

    throw new Error('Thiếu thông tin xác thực Sapo (Nhập API Key + API Secret hoặc Access Token)');
  }

  /** Custom HTTPS Agent để tránh lỗi SSL handshake với SAPO server */
  private getHttpsAgent() {
    const crypto = require('crypto');
    let secureOptions = 0;
    // Chỉ set flag nếu constant tồn tại (OpenSSL). Bỏ qua nếu không (BoringSSL/Electron).
    try {
      if (typeof crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION === 'number') {
        secureOptions |= crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION;
      }
    } catch (_) { /* BoringSSL: constant không tồn tại */ }

    return new https.Agent({
      rejectUnauthorized: true,
      // BoringSSL trên Electron không handle renegotiation tốt với keepAlive.
      // Tắt keepAlive để mỗi request tạo handshake mới → tránh renegotiation.
      keepAlive: false,
      // Cipher suite tương thích với Cloudflare và BoringSSL, ưu tiên TLS 1.2
      ciphers: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'DHE-RSA-AES128-GCM-SHA256',
        'DHE-RSA-AES256-GCM-SHA384',
      ].join(':'),
      honorCipherOrder: true,
      ecdhCurve: 'auto',
      secureOptions,
    });
  }

  private getAxiosConfig() {
    return {
      headers: this.getHeaders(),
      timeout: 15000,
      httpsAgent: this.getHttpsAgent(),
    };
  }

  private async apiGet(path: string, params?: Record<string, any>): Promise<any> {
    const res = await axios.get(`${this.getBaseUrl()}${path}`, {
      ...this.getAxiosConfig(),
      params,
    });
    return res.data;
  }

  private async apiPost(path: string, body: any): Promise<any> {
    const res = await axios.post(`${this.getBaseUrl()}${path}`, body, {
      ...this.getAxiosConfig(),
    });
    return res.data;
  }

  async testConnection(): Promise<TestResult> {
    try {
      // Validate credentials trước khi gọi API
      const { storeDomain, accessToken, apiKey, apiSecret } = this.config.credentials;
      if (!storeDomain) return { success: false, message: 'Thiếu tên store (subdomain) — VD: ten-cua-hang' };
      if (!accessToken && (!apiKey || !apiSecret)) {
        return { success: false, message: 'Thiếu thông tin xác thực: Vui lòng nhập API Key + API Secret hoặc Access Token' };
      }

      const data = await this.apiGet('/admin/store.json');
      const name = data?.store?.name || data?.store?.domain || 'Sapo Store';
      return { success: true, message: `Kết nối Sapo thành công — store: ${name}` };
    } catch (e: any) {
      // Phân loại lỗi
      const isTlsError = e.code === 'EPROTO' || e.message?.includes('handshake') || e.message?.includes('SSL');
      const isDnsError = e.code === 'ENOTFOUND' || e.message?.includes('ENOTFOUND');
      const isTimeout = e.code === 'ECONNABORTED' || e.message?.includes('timeout');
      const isAuthError = e.response?.status === 401 || e.response?.status === 403;

      if (isTlsError) {
        const hint = e.message?.includes('BoringSSL') || e.message?.includes('third_party')
          ? 'Phần mềm đang chạy trên Electron (BoringSSL). Thử tắt tường lửa / VPN, hoặc kiểm tra proxy.'
          : '';
        return { success: false, message: `Lỗi SSL/TLS — Kiểm tra storeDomain "${this.config.credentials.storeDomain}" có đúng không. Chi tiết: ${e.message}. ${hint}`.trim() };
      }
      if (isDnsError) {
        return { success: false, message: `Không tìm thấy domain "${this.config.credentials.storeDomain}.mysapo.net" — kiểm tra lại tên store` };
      }
      if (isTimeout) {
        return { success: false, message: `Kết nối tới Sapo bị timeout — kiểm tra mạng hoặc tường lửa` };
      }
      if (isAuthError) {
        return { success: false, message: `Sai Access Token hoặc token hết hạn — kiểm tra lại token trong SAPO Admin` };
      }

      return { success: false, message: `Lỗi kết nối Sapo: ${e.response?.data?.errors || e.message}` };
    }
  }

  /**
   * Tìm khách hàng theo SĐT hoặc email.
   * SAPO Customer API KHÔNG hỗ trợ search param — phải fetch rồi filter client-side.
   */
  private async findCustomers(keyword: string, limit: number): Promise<any[]> {
    const kw = keyword.trim();
    if (!kw) return [];

    let apiCustomers: any[] = [];
    
    // 1. Thử gọi API filter theo phone hoặc email trực tiếp
    try {
      if (kw.match(/^\+?\d+$/)) {
        const cleanPhone = kw.replace(/[^\d]/g, '');
        const suffix = cleanPhone.slice(-9); // Lấy 9 số cuối
        const res1 = await this.apiGet('/admin/customers.json', { phone: kw });
        if (Array.isArray(res1?.customers)) apiCustomers.push(...res1.customers);
        
        const res2 = await this.apiGet('/admin/customers.json', { phone: `0${suffix}` });
        if (Array.isArray(res2?.customers)) apiCustomers.push(...res2.customers);

        const res3 = await this.apiGet('/admin/customers.json', { phone: `+84${suffix}` });
        if (Array.isArray(res3?.customers)) apiCustomers.push(...res3.customers);
      } else if (kw.includes('@')) {
        const res = await this.apiGet('/admin/customers.json', { email: kw });
        if (Array.isArray(res?.customers)) apiCustomers.push(...res.customers);
      }
    } catch {
      // Fallback về quét client-side
    }

    // 2. Nếu tìm kiếm trực tiếp không ra kết quả, hoặc để chắc chắn, tải danh sách về để filter
    if (apiCustomers.length === 0) {
      try {
        const data = await this.apiGet('/admin/customers.json', {
          fields: 'id,first_name,last_name,email,phone,default_address,addresses,note,tags',
          limit: 250,
          page: 1,
        });
        apiCustomers = data.customers || [];
      } catch {
        apiCustomers = [];
      }
    }

    const matchPhone = (p1: string | undefined | null, p2: string): boolean => {
      if (!p1) return false;
      const clean1 = p1.replace(/[^\d]/g, '');
      const clean2 = p2.replace(/[^\d]/g, '');
      return clean1.slice(-9) === clean2.slice(-9) && clean1.slice(-9).length >= 9;
    };

    const seenIds = new Set<number>();
    const filtered: any[] = [];
    const lowerKw = kw.toLowerCase();

    for (const c of apiCustomers) {
      if (seenIds.has(c.id)) continue;

      let isMatch = false;
      if (c.email?.toLowerCase() === lowerKw) isMatch = true;
      else if (c.phone && matchPhone(c.phone, kw)) isMatch = true;
      else if (c.default_address?.phone && matchPhone(c.default_address.phone, kw)) isMatch = true;
      else if (c.addresses?.some((a: any) => a.phone && matchPhone(a.phone, kw))) isMatch = true;

      if (isMatch) {
        seenIds.add(c.id);
        filtered.push(c);
      }
    }

    return filtered.slice(0, limit);
  }

  /**
   * Filter sản phẩm theo keyword (title).
   * SAPO Product API KHÔNG hỗ trợ param title — phải fetch rồi filter client-side.
   */
  private async filterProducts(keyword: string, limit: number): Promise<any[]> {
    const data = await this.apiGet('/admin/products.json', {
      fields: 'id,name,title,images,product_type,variants',
      limit: 250,
      page: 1,
    });
    const all: any[] = data.products || [];
    const kw = keyword.toLowerCase().trim();
    if (!kw) return all.slice(0, limit);

    return all
      .filter(p =>
        (p.name || '').toLowerCase().includes(kw) ||
        (p.title || '').toLowerCase().includes(kw) ||
        (p.product_type || '').toLowerCase().includes(kw) ||
        (p.variants || []).some((v: any) =>
          (v.sku || '').toLowerCase().includes(kw) ||
          (v.barcode || '').toLowerCase().includes(kw),
        )
      )
      .slice(0, limit);
  }

  async executeAction(action: string, params: Record<string, any>): Promise<any> {
    switch (action) {
      case 'lookupCustomer': {
        const keyword = params.phone || params.email || params.query;
        if (!keyword) throw new Error('Cần cung cấp SĐT hoặc email để tra cứu khách hàng');
        const customers = await this.findCustomers(keyword, params.limit || 5);
        return { customers, found: customers.length > 0, firstCustomer: customers[0] || null };
      }

      case 'lookupOrder': {
        if (params.orderId) {
          const orderIdStr = String(params.orderId).trim();
          
          // 1. Nếu là ID nội bộ (chỉ chứa số và dài)
          if (/^\d+$/.test(orderIdStr) && orderIdStr.length > 8) {
            try {
              const data = await this.apiGet(`/admin/orders/${orderIdStr}.json`);
              if (data?.order) {
                return { order: data.order, orders: [data.order], found: true };
              }
            } catch {
              // Tiếp tục tìm theo name nếu gọi trực tiếp ID thất bại
            }
          }

          // 2. Tìm kiếm theo tên đơn hàng (name) - VD: #1033MKS
          let data = await this.apiGet('/admin/orders.json', { name: orderIdStr });
          let orders = data?.orders || [];

          // Nếu không tìm thấy và mã không bắt đầu bằng '#', thử tìm với '#' phía trước
          if (orders.length === 0 && !orderIdStr.startsWith('#')) {
            data = await this.apiGet('/admin/orders.json', { name: `#${orderIdStr}` });
            orders = data?.orders || [];
          }

          // Nếu vẫn không tìm thấy, thử tìm kiếm chung bằng query (Sapo hỗ trợ query để search rộng hơn)
          if (orders.length === 0) {
            data = await this.apiGet('/admin/orders.json', { query: orderIdStr });
            orders = data?.orders || [];
          }

          const order = orders[0] || null;
          return { order, orders, found: orders.length > 0 };
        }

        // Tra cứu theo SĐT: lookup customer → lấy customerId → query orders
        if (params.phone) {
          const customers = await this.findCustomers(params.phone, 1);
          const customer = customers[0];
          if (!customer) {
            return { orders: [], order: null, found: false, message: 'Không tìm thấy khách hàng với SĐT này' };
          }
          const data = await this.apiGet('/admin/orders.json', {
            customer_id: customer.id,
            limit: params.limit || 10,
          });
          const orders: any[] = data.orders || [];
          return { orders, order: orders[0] || null, found: orders.length > 0, customer };
        }

        // Tra cứu theo customerId
        if (params.customerId) {
          const data = await this.apiGet('/admin/orders.json', {
            customer_id: params.customerId,
            limit: params.limit || 10,
          });
          const orders: any[] = data.orders || [];
          return { orders, order: orders[0] || null, found: orders.length > 0 };
        }

        throw new Error('Cần cung cấp orderId, customerId hoặc phone');
      }

      case 'createOrder': {
        const data = await this.apiPost('/admin/orders.json', { order: params.order });
        return { order: data.order, success: true };
      }

      case 'getProducts': {
        const data = await this.apiGet('/admin/products.json', {
          fields: 'id,name,title,images,product_type,variants',
          limit: params.limit || 20,
          page: params.page || 1,
        });
        const products: any[] = data.products || [];
        const flattened = products.flatMap((p: any) =>
          (p.variants || []).map((v: any) => {
            const productTitle = p.name || p.title || '';
            const variantTitle = v.title || v.name || '';
            const displayTitle = variantTitle && p.variants.length > 1 ? `${productTitle} - ${variantTitle}` : productTitle;
            return {
              id: v.id,
              product_id: p.id,
              title: displayTitle,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price,
              inventory_quantity: v.inventory_quantity ?? 0,
              images: p.images || [],
              image: p.images?.find((img: any) => img.id === v.image_id) || p.images?.[0] || p.image || null,
            };
          }),
        );
        return { products: flattened };
      }

      case 'getInventory': {
        // SAPO KHÔNG có endpoint /admin/inventory_items.json
        // Thay vào đó, đọc inventory_quantity từ variants của products
        const data = await this.apiGet('/admin/products.json', {
          fields: 'id,title,variants',
          limit: params.limit || 50,
          page: 1,
        });
        const products: any[] = data.products || [];
        // Flatten variants → items với thông tin tồn kho
        const items = products.flatMap((p: any) =>
          (p.variants || []).map((v: any) => ({
            product_id: p.id,
            product_title: p.title,
            variant_id: v.id,
            variant_title: v.title,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,
            inventory_quantity: v.inventory_quantity ?? 0,
            inventory_policy: v.inventory_policy,
          })),
        );
        return { items };
      }

      case 'lookupProduct': {
        const keyword = params.keyword || '';
        const products = await this.filterProducts(keyword, params.limit || 10);
        const flattened = products.flatMap((p: any) =>
          (p.variants || []).map((v: any) => {
            const productTitle = p.name || p.title || '';
            const variantTitle = v.title || v.name || '';
            const displayTitle = variantTitle && p.variants.length > 1 ? `${productTitle} - ${variantTitle}` : productTitle;
            return {
              id: v.id,
              product_id: p.id,
              title: displayTitle,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price,
              inventory_quantity: v.inventory_quantity ?? 0,
              images: p.images || [],
              image: p.images?.find((img: any) => img.id === v.image_id) || p.images?.[0] || p.image || null,
            };
          }),
        );
        return { products: flattened, found: flattened.length > 0 };
      }

      default:
        throw new Error(`Sapo không hỗ trợ action: ${action}`);
    }
  }
}
