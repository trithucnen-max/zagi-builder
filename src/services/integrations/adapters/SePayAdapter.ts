import axios from 'axios';
import { IntegrationAdapter, TestResult } from '../IntegrationAdapter';

/**
 * SePay payment webhook adapter.
 * Credentials required: apiKey
 * Optional: webhookSecretKey
 * Docs: https://sepay.vn/tai-lieu-api.html
 */
export class SePayAdapter extends IntegrationAdapter {
  readonly type = 'sepay';
  readonly name = 'SePay';

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.config.credentials.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private resolvedConfig: {
    baseUrl: string;
    pathAccounts: string;
    pathTransactions: string;
    isV2: boolean;
  } | null = null;

  private async resolveEndpoints(): Promise<{
    baseUrl: string;
    pathAccounts: string;
    pathTransactions: string;
    isV2: boolean;
  }> {
    if (this.resolvedConfig) return this.resolvedConfig;

    const options = [
      // Option 1: Production v2
      {
        baseUrl: 'https://userapi.sepay.vn/v2',
        pathAccounts: '/bank-accounts',
        pathTransactions: '/transactions',
        isV2: true,
      },
      // Option 2: Sandbox v2
      {
        baseUrl: 'https://userapi-sandbox.sepay.vn/v2',
        pathAccounts: '/bank-accounts',
        pathTransactions: '/transactions',
        isV2: true,
      },
      // Option 3: Production v1 (legacy fallback)
      {
        baseUrl: 'https://my.sepay.vn/userapi',
        pathAccounts: '/bankaccounts/list',
        pathTransactions: '/transactions/list',
        isV2: false,
      }
    ];

    for (const opt of options) {
      try {
        const res = await axios.get(`${opt.baseUrl}${opt.pathAccounts}`, {
          headers: this.getHeaders(),
          timeout: 4000,
        });
        if (res.status === 200 || res.data?.status === 200 || res.data?.status === 'success') {
          this.resolvedConfig = opt;
          return opt;
        }
      } catch (e) {
        // Continue to next option if failed/unauthorized
      }
    }

    // Default fallback to Option 1
    return options[0];
  }

  async testConnection(): Promise<TestResult> {
    try {
      const config = await this.resolveEndpoints();
      const res = await axios.get(`${config.baseUrl}${config.pathAccounts}`, {
        headers: this.getHeaders(),
        timeout: 10000,
      });
      if (res.status === 200 || res.data?.status === 200 || res.data?.status === 'success') {
        let count = 0;
        if (config.isV2) {
          count = res.data?.data?.length || 0;
        } else {
          count = res.data?.bankAccounts?.length || 0;
        }
        const mode = config.baseUrl.includes('sandbox') ? 'Sandbox/Test' : 'Production';
        return { success: true, message: `Kết nối SePay thành công (${mode}) — Tìm thấy ${count} tài khoản ngân hàng` };
      }
      return { success: false, message: res.data?.messages || 'Không thể kết nối SePay' };
    } catch (e: any) {
      return { success: false, message: `Lỗi kết nối SePay: ${e.response?.data?.messages || e.message}` };
    }
  }

  async executeAction(action: string, params: Record<string, any>): Promise<any> {
    switch (action) {
      case 'getTransactions': {
        const config = await this.resolveEndpoints();
        const res = await axios.get(`${config.baseUrl}${config.pathTransactions}`, {
          headers: this.getHeaders(),
          params: {
            limit: params.limit || 20,
            reference_number: params.reference,
          },
          timeout: 10000,
        });
        const list = config.isV2 ? (res.data?.data || []) : (res.data?.transactions || []);
        return { transactions: list };
      }

      case 'getBankAccounts': {
        const config = await this.resolveEndpoints();
        const res = await axios.get(`${config.baseUrl}${config.pathAccounts}`, {
          headers: this.getHeaders(),
          timeout: 10000,
        });
        const list = config.isV2 ? (res.data?.data || []) : (res.data?.bankAccounts || []);
        return { accounts: list };
      }

      case 'handleWebhook': {
        const { webhookSecretKey } = this.config.credentials;
        if (webhookSecretKey && params.checksum) {
          const crypto = require('crypto');
          const dataStr = JSON.stringify(params.body);
          const computed = crypto.createHmac('sha256', webhookSecretKey).update(dataStr).digest('hex');
          if (computed !== params.checksum) {
            throw new Error('SePay webhook checksum không hợp lệ');
          }
        }
        return { valid: true, transaction: params.body };
      }

      default:
        throw new Error(`SePay không hỗ trợ action: ${action}`);
    }
  }
}

