import { MediaWikiClient, RequestHelper } from '../src/MediaWikiClient';

describe('MediaWikiClient Repro Issue #1', () => {
	let mockRequestHelper: jest.Mocked<RequestHelper>;
	let client: MediaWikiClient;

	beforeEach(() => {
		mockRequestHelper = {
			request: jest.fn(),
		};
		client = new MediaWikiClient(
			{
				baseUrl: 'https://private-wiki.com',
				username: 'bot',
				password: 'password',
			},
			mockRequestHelper
		);
	});

	test('should send authenticated request when fetching tokens', async () => {
		// Mock the response for token fetching
		mockRequestHelper.request.mockResolvedValueOnce({
			query: {
				tokens: {
					csrftoken: 'test-token',
				},
			},
		});

		// Mock the response for editing
		mockRequestHelper.request.mockResolvedValueOnce({
			edit: {
				result: 'Success',
			},
		});

		await client.editPage({
			title: 'Test Page',
			content: 'Test Content',
		});

		// Check the first call (token fetching)
		const firstCall = mockRequestHelper.request.mock.calls[0][0];
		
		expect(firstCall.url).toBe('https://private-wiki.com/api.php');
		expect(firstCall.baseURL).toBeUndefined();
		expect(firstCall.auth).toEqual({
			user: 'bot',
			pass: 'password',
			username: 'bot',
			password: 'password',
		});
		expect(firstCall.headers.Authorization).toBeDefined();
		expect(firstCall.headers['User-Agent']).toBe('n8n-mediawiki-node');
	});
});
