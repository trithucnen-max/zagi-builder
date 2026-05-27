import ZaloService from '../services/zalo/ZaloService';
import { ThreadType } from 'zca-js';

// Mock the dependencies
jest.mock('../../src/utils/Logger', () => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
}));

jest.mock('../../src/utils/ConnectionManager', () => ({
    getOrCreateConnection: jest.fn(),
}));

describe('ZaloService - forwardMessage', () => {
    let zaloService: ZaloService;
    let mockApi: any;

    beforeEach(() => {
        mockApi = {
            forwardMessage: jest.fn().mockResolvedValue({ success: true }),
            getOwnId: jest.fn().mockReturnValue('12345678'),
        };

        // Create ZaloService instance manually by mocking the constructor/initialize
        zaloService = Object.create(ZaloService.prototype);
        (zaloService as any).api = mockApi;
        (zaloService as any).zaloId = '12345678';
    });

    it('should successfully parse valid JSON string and call api.forwardMessage', async () => {
        const messageString = JSON.stringify({ data: { content: 'Test Forward Message' } });
        const threadIds = ['thread123'];

        const result = await zaloService.forwardMessage(messageString, threadIds, ThreadType.User);

        expect(mockApi.forwardMessage).toHaveBeenCalledWith(
            { message: 'Test Forward Message' },
            threadIds,
            ThreadType.User
        );
        expect(result).toEqual({ success: true });
    });

    it('should throw ZaloApiError/Error when parsed JSON is missing data.content', async () => {
        // Test with empty content
        const messageString = JSON.stringify({ data: { content: '' } });
        const threadIds = ['thread123'];

        mockApi.forwardMessage.mockRejectedValueOnce(new Error('Missing message content'));

        await expect(zaloService.forwardMessage(messageString, threadIds, ThreadType.User))
            .rejects.toThrow('Missing message content');
    });
});
