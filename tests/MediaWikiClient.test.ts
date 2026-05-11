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
		expect(firstCall.auth).toEqual({
			user: 'bot',
			pass: 'password',
		});
	});

	test('should use httpRequest with correct Content-Type for POST', async () => {
		mockRequestHelper.httpRequest = jest.fn().mockResolvedValueOnce({
			query: { tokens: { csrftoken: 'test-token' } }
		}).mockResolvedValueOnce({
			edit: { result: 'Success' }
		});
		
		await client.editPage({
			title: 'Test Page',
			content: 'Test Content',
		});

		// The second call is the POST request
		expect(mockRequestHelper.httpRequest).toHaveBeenCalledTimes(2);
		const postCall = (mockRequestHelper.httpRequest as jest.Mock).mock.calls[1][0];
		expect(postCall.method).toBe('POST');
		expect(postCall.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
		expect(postCall.body).toBeDefined();
		expect(postCall.body.action).toBe('edit');
	});
});
