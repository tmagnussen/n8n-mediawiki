export interface MediaWikiCredentials {
	baseUrl?: string;
	username?: string;
	password?: string;
}

export interface PageGetOptions {
	title: string;
}

export interface PageEditOptions {
	title: string;
	content: string;
	summary?: string;
}

export interface SearchOptions {
	query: string;
	limit?: number;
}

export interface PageDeleteOptions {
	title: string;
	reason?: string;
}

export interface RequestHelper {
	request(options: any): Promise<any>;
}

export class MediaWikiClient {
	private baseUrl: string;
	private requestHelper: RequestHelper;
	private credentials?: MediaWikiCredentials | undefined;

	constructor(credentials: MediaWikiCredentials | undefined, requestHelper: RequestHelper) {
		this.credentials = credentials;
		let rawBaseUrl = credentials?.baseUrl || 'https://en.wikipedia.org';
		
		// Normalize base URL: remove trailing slashes and /api.php if present
		rawBaseUrl = rawBaseUrl.replace(/\/+$/, '');
		if (rawBaseUrl.endsWith('/api.php')) {
			rawBaseUrl = rawBaseUrl.substring(0, rawBaseUrl.length - 8);
		}
		this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
		
		this.requestHelper = requestHelper;
	}

	private async request(options: any): Promise<any> {
		const requestOptions = { ...options };

		// Ensure we use the full URL to avoid baseURL/url combination issues in different n8n versions
		if (!requestOptions.url.startsWith('http')) {
			const path = requestOptions.url.startsWith('/') ? requestOptions.url : `/${requestOptions.url}`;
			requestOptions.url = `${this.baseUrl}${path}`;
			delete requestOptions.baseURL;
		}

		// Add authentication if credentials are provided
		if (this.credentials?.username && this.credentials?.password) {
			// Provide both for maximum compatibility with different n8n request helper versions
			requestOptions.auth = {
				user: this.credentials.username,
				pass: this.credentials.password,
				username: this.credentials.username,
				password: this.credentials.password,
			};

			// Also inject explicit Authorization header as a fallback
			if (!requestOptions.headers) {
				requestOptions.headers = {};
			}
			const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
			requestOptions.headers['Authorization'] = `Basic ${auth}`;
		}

		// Add a standard User-Agent
		if (!requestOptions.headers) {
			requestOptions.headers = {};
		}
		if (!requestOptions.headers['User-Agent']) {
			requestOptions.headers['User-Agent'] = 'n8n-mediawiki-node';
		}

		return this.requestHelper.request(requestOptions);
	}

	private getApiUrl(): string {
		// If baseUrl already ends with api.php, return it as-is
		if (this.baseUrl.endsWith('/api.php')) {
			return this.baseUrl;
		}
		// Otherwise, append /api.php
		return `${this.baseUrl}/api.php`;
	}

	// Helper method for debugging URL construction
	getDebugInfo(): { baseUrl: string; apiUrl: string } {
		return {
			baseUrl: this.baseUrl,
			apiUrl: this.getApiUrl(),
		};
	}

	async getPage(options: PageGetOptions): Promise<any> {
		return this.request({
			method: 'GET',
			baseURL: this.baseUrl,
			url: '/api.php',
			qs: {
				action: 'query',
				prop: 'revisions',
				titles: options.title,
				rvprop: 'content',
				format: 'json',
			},
			json: true,
		});
	}

	async editPage(options: PageEditOptions): Promise<any> {
		// First, we need to get a proper CSRF token for authenticated requests
		let token = '+\\'; // Anonymous token
		
		try {
			// Try to get a CSRF token for authenticated editing
			const requestOptions = {
				method: 'GET',
				baseURL: this.baseUrl,
				url: '/api.php',
				qs: {
					action: 'query',
					meta: 'tokens',
					format: 'json',
				},
				json: true,
			};
			
			const tokenResponse = await this.request(requestOptions);
			
			if (tokenResponse && tokenResponse.query && tokenResponse.query.tokens && tokenResponse.query.tokens.csrftoken) {
				token = tokenResponse.query.tokens.csrftoken;
			}
		} catch (error) {
			// If we can't get a token, continue with anonymous token
			console.warn('Could not retrieve CSRF token, using anonymous token');
		}

		const formData: any = {
			action: 'edit',
			title: options.title,
			text: options.content,
			format: 'json',
			token: token,
		};

		if (options.summary) {
			formData.summary = options.summary;
		}

		const editRequestOptions = {
			method: 'POST',
			baseURL: this.baseUrl,
			url: '/api.php',
			form: formData,
			json: true,
		};
		
		return this.request(editRequestOptions);
	}

	async searchPages(options: SearchOptions): Promise<any> {
		return this.request({
			method: 'GET',
			baseURL: this.baseUrl,
			url: '/api.php',
			qs: {
				action: 'query',
				list: 'search',
				srsearch: options.query,
				srlimit: Math.min(options.limit || 10, 500),
				format: 'json',
			},
			json: true,
		});
	}

	async deletePage(options: PageDeleteOptions): Promise<any> {
		// First, we need to get a proper CSRF token for authenticated requests
		let token = '+\\'; // Anonymous token
		
		try {
			// Try to get a CSRF token for authenticated deletion
			const requestOptions = {
				method: 'GET',
				baseURL: this.baseUrl,
				url: '/api.php',
				qs: {
					action: 'query',
					meta: 'tokens',
					format: 'json',
				},
				json: true,
			};
			
			const tokenResponse = await this.request(requestOptions);
			
			if (tokenResponse && tokenResponse.query && tokenResponse.query.tokens && tokenResponse.query.tokens.csrftoken) {
				token = tokenResponse.query.tokens.csrftoken;
			}
		} catch (error) {
			// If we can't get a token, continue with anonymous token
			console.warn('Could not retrieve CSRF token, using anonymous token');
		}

		const formData: any = {
			action: 'delete',
			title: options.title,
			format: 'json',
			token: token,
		};

		if (options.reason) {
			formData.reason = options.reason;
		}

		const deleteRequestOptions = {
			method: 'POST',
			baseURL: this.baseUrl,
			url: '/api.php',
			form: formData,
			json: true,
		};
		
		return this.request(deleteRequestOptions);
	}

	async getSiteInfo(): Promise<any> {
		return this.request({
			method: 'GET',
			baseURL: this.baseUrl,
			url: '/api.php',
			qs: {
				action: 'query',
				meta: 'siteinfo',
				format: 'json',
			},
			json: true,
		});
	}
}