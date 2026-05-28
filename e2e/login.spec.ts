import { _electron as electron, test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Zalo Login Flow E2E Tests', () => {
  let electronApp: any;
  let page: any;

  test.beforeEach(async () => {
    // Launch Electron App in production mode to load local index.html directly
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PLAYWRIGHT_TEST: 'true'
      }
    });

    electronApp.process().stdout.on('data', (data: any) => {
      console.log('ELECTRON STDOUT:', data.toString());
    });

    electronApp.process().stderr.on('data', (data: any) => {
      console.error('ELECTRON STDERR:', data.toString());
    });

    // Wait for the first window to open
    page = await electronApp.firstWindow();
  });

  test.afterEach(async () => {
    // Close Electron App
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('should render main page and navigate through Zalo Login modal tabs', async () => {
    // 1. Verify app title or main screen
    await expect(page).toHaveTitle(/Zagi/i);

    // Wait for App loading state to resolve (loading state should close, rendering main layout)
    // Sidebar should be visible
    const sidebar = page.locator('div.w-16.bg-gray-900');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // 2. Click "Thêm tài khoản" button
    const addAccountBtn = page.getByTitle('Thêm tài khoản');
    await expect(addAccountBtn).toBeVisible();
    await addAccountBtn.click();

    // 3. Verify modal appeared and select Zalo channel
    const modalHeader = page.locator('h2.text-white');
    await expect(modalHeader).toHaveText('Thêm tài khoản');

    const zaloChannelBtn = page.locator('text=Zalo cá nhân');
    await expect(zaloChannelBtn).toBeVisible();
    await zaloChannelBtn.click();

    // 4. Verify Zalo Login details and default QR Code tab
    await expect(modalHeader).toHaveText('Đăng nhập Zalo cá nhân');
    
    const qrTabBtn = page.getByRole('button', { name: /Quét mã QR/i });
    const cookieTabBtn = page.getByRole('button', { name: /Cookies \/ IMEI/i });
    await expect(qrTabBtn).toBeVisible();
    await expect(cookieTabBtn).toBeVisible();

    // QR Tab is selected by default, verify QR loading state or waiting text
    const qrHintText = page.locator('text=Mở Zalo → Quét mã QR');
    const qrLoadingText = page.locator('text=Đang tạo mã QR...');
    await expect(qrHintText.or(qrLoadingText)).toBeVisible();

    // 5. Switch to Cookie Login Tab
    await cookieTabBtn.click();

    const authJsonLabel = page.locator('label:has-text("Auth JSON")');
    await expect(authJsonLabel).toBeVisible();

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    // 6. Test JSON Validation
    // Scenario A: Invalid JSON format
    await textarea.fill('invalid json string');
    const invalidJsonHint = page.locator('text=⚠ JSON không hợp lệ');
    await expect(invalidJsonHint).toBeVisible();

    // Scenario B: Valid JSON but missing required fields (cookies, userAgent)
    await textarea.fill('{"imei": "1234567890"}');
    const missingCookiesHint = page.locator('text=⚠ Thiếu trường "cookies"');
    await expect(missingCookiesHint).toBeVisible();

    // Scenario C: Valid JSON but missing userAgent
    await textarea.fill('{"imei": "1234567890", "cookies": "test_cookies"}');
    const missingUAHint = page.locator('text=⚠ Thiếu trường "userAgent"');
    await expect(missingUAHint).toBeVisible();

    // Scenario D: Correct JSON format
    await textarea.fill('{"imei": "1234567890", "cookies": "test_cookies", "userAgent": "test_ua"}');
    const validationErrors = page.locator('text=⚠');
    await expect(validationErrors).not.toBeVisible();

    // 7. Test closing the modal
    const closeBtn = page.locator('div.fixed.inset-0 .justify-between > button');
    await closeBtn.click();

    // Verify modal is closed
    await expect(modalHeader).not.toBeVisible();
  });
});
