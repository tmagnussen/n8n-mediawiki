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
	httpRequest?(options: any): Promise<any>;
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

		// Ensure we use the full URL
		if (!requestOptions.url.startsWith('http')) {
			const path = requestOptions.url.startsWith('/') ? requestOptions.url : `/${requestOptions.url}`;
			requestOptions.url = `${this.baseUrl}${path}`;
			delete requestOptions.baseURL;
		}

		// Use httpRequest if available (preferred in modern n8n)
		if (this.requestHelper.httpRequest) {
			const httpOptions: any = {
				method: requestOptions.method,
				url: requestOptions.url,
				headers: {
					'User-Agent': 'n8n-mediawiki-node',
					...requestOptions.headers,
				},
				json: true,
			};

			if (requestOptions.qs) httpOptions.qs = requestOptions.qs;
			
			if (requestOptions.form) {
				httpOptions.body = requestOptions.form;
				// n8n's httpRequest uses the 'body' property for both JSON and form data
				// but we must specify the content type for form data
				httpOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
				// When using application/x-www-form-urlencoded in n8n's httpRequest, 
				// we often need to set 'json: false' if we are passing a string or use specific n8n logic.
				// However, MediaWiki expects standard form encoding.
			}
			
			if (requestOptions.body && !httpOptions.headers['Content-Type']) {
				httpOptions.body = requestOptions.body;
			}

			// Add authentication if credentials are provided
			if (this.credentials?.username && this.credentials?.password) {
				httpOptions.auth = {
					username: this.credentials.username,
					password: this.credentials.password,
				};
			}

			try {
				return await this.requestHelper.httpRequest(httpOptions);
			} catch (error: any) {
				// Re-throw with more context if possible
				if (error.response && error.response.data) {
					const apiError = error.response.data.error;
					if (apiError) {
						throw new Error(`MediaWiki API Error: ${apiError.code} - ${apiError.info}`);
					}
				}
				throw error;
			}
		}

		// Fallback to older request helper
		if (this.credentials?.username && this.credentials?.password) {
			requestOptions.auth = {
				user: this.credentials.username,
				pass: this.credentials.password,
			};
		}

		// Ensure Content-Type is set for POST requests even in fallback
		if (requestOptions.method === 'POST' && (requestOptions.form || requestOptions.body)) {
			if (!requestOptions.headers) requestOptions.headers = {};
			if (!requestOptions.headers['Content-Type']) {
				requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
			}
		}

		return this.requestHelper.request(requestOptions);
	}

	async getPage(options: PageGetOptions): Promise<any> {
		return this.request({
			method: 'GET',
			url: '/api.php',
			qs: {
				action: 'query',
				prop: 'revisions',
				titles: options.title,
				rvprop: 'content',
				format: 'json',
			},
		});
	}

	async editPage(options: PageEditOptions): Promise<any> {
		// First, we need to get a proper CSRF token for authenticated requests
		let token = '+\\'; // Anonymous token
		
		try {
			// Try to get a CSRF token for authenticated editing
			const requestOptions = {
				method: 'GET',
				url: '/api.php',
				qs: {
					action: 'query',
					meta: 'tokens',
					format: 'json',
				},
			};
			
			const tokenResponse = await this.request(requestOptions);
			
			if (tokenResponse && tokenResponse.query && tokenResponse.query.tokens && tokenResponse.query.tokens.csrftoken) {
				token = tokenResponse.query.tokens.csrftoken;
			}
		} catch (error: any) {
			// If we can't get a token, continue with anonymous token
			console.warn('Could not retrieve CSRF token, using anonymous token:', error.message);
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

		return this.request({
			method: 'POST',
			url: '/api.php',
			form: formData,
		});
	}

	async searchPages(options: SearchOptions): Promise<any> {
		return this.request({
			method: 'GET',
			url: '/api.php',
			qs: {
				action: 'query',
				list: 'search',
				srsearch: options.query,
				srlimit: Math.min(options.limit || 10, 500),
				format: 'json',
			},
		});
	}

	async deletePage(options: PageDeleteOptions): Promise<any> {
		// First, we need to get a proper CSRF token for authenticated requests
		let token = '+\\'; // Anonymous token
		
		try {
			// Try to get a CSRF token for authenticated deletion
			const requestOptions = {
				method: 'GET',
				url: '/api.php',
				qs: {
					action: 'query',
					meta: 'tokens',
					format: 'json',
				},
			};
			
			const tokenResponse = await this.request(requestOptions);
			
			if (tokenResponse && tokenResponse.query && tokenResponse.query.tokens && tokenResponse.query.tokens.csrftoken) {
				token = tokenResponse.query.tokens.csrftoken;
			}
		} catch (error: any) {
			console.warn('Could not retrieve CSRF token, using anonymous token:', error.message);
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

		return this.request({
			method: 'POST',
			url: '/api.php',
			form: formData,
		});
	}

	async getSiteInfo(): Promise<any> {
		return this.request({
			method: 'GET',
			url: '/api.php',
			qs: {
				action: 'query',
				meta: 'siteinfo',
				format: 'json',
			},
		});
	}
}
