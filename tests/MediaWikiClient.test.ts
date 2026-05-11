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

	test('should send authenticated request with manual Authorization header', async () => {
		mockRequestHelper.request.mockResolvedValueOnce({
			query: { tokens: { csrftoken: 'test-token' } }
		});

		await client.getSiteInfo();

		const call = mockRequestHelper.request.mock.calls[0][0];
		expect(call.headers.Authorization).toBeDefined();
		expect(call.headers.Authorization).toMatch(/^Basic /);
	});

	test('should use httpRequest with URL-encoded body for POST', async () => {
		mockRequestHelper.httpRequest = jest.fn()
			.mockResolvedValueOnce(JSON.stringify({ query: { tokens: { csrftoken: 'test-token' } } }))
			.mockResolvedValueOnce(JSON.stringify({ edit: { result: 'Success' } }));
		
		await client.editPage({
			title: 'Test Page',
			content: 'Test Content',
		});

		// The second call is the POST request
		expect(mockRequestHelper.httpRequest).toHaveBeenCalledTimes(2);
		const postCall = (mockRequestHelper.httpRequest as jest.Mock).mock.calls[1][0];
		expect(postCall.method).toBe('POST');
		expect(postCall.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
		expect(postCall.headers.Authorization).toBeDefined();
		expect(typeof postCall.body).toBe('string');
		expect(postCall.body).toContain('action=edit');
		expect(postCall.body).toContain('title=Test+Page');
		expect(postCall.json).toBe(false);
	});
});
