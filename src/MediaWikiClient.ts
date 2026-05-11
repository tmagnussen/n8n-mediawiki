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
	private cookieJar: string[] = [];

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

	private extractCookies(headers: any) {
		const setCookie = headers['set-cookie'] || headers['Set-Cookie'] || headers['set-cookie[]'];
		if (setCookie) {
			const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
			for (const cookie of cookies) {
				const cookiePart = cookie.split(';')[0].trim();
				if (cookiePart && cookiePart.includes('=')) {
					const name = cookiePart.split('=')[0];
					const index = this.cookieJar.findIndex(c => c.startsWith(name + '='));
					if (index !== -1) {
						this.cookieJar[index] = cookiePart;
					} else {
						this.cookieJar.push(cookiePart);
					}
				}
			}
		}
	}

	private async request(options: any): Promise<any> {
		const requestOptions = { ...options };

		// Ensure we use the full URL
		if (!requestOptions.url.startsWith('http')) {
			const path = requestOptions.url.startsWith('/') ? requestOptions.url : `/${requestOptions.url}`;
			requestOptions.url = `${this.baseUrl}${path}`;
			delete requestOptions.baseURL;
		}

		// Prepare headers
		const headers: any = {
			'User-Agent': 'n8n-mediawiki-node',
			...requestOptions.headers,
		};

		// Add cookies from jar
		if (this.cookieJar.length > 0) {
			headers['Cookie'] = this.cookieJar.join('; ');
		}

		// Add authentication header manually for maximum reliability (Basic Auth)
		if (this.credentials?.username && this.credentials?.password) {
			const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
			headers['Authorization'] = `Basic ${auth}`;
		}

		// Use httpRequest if available (preferred in modern n8n)
		if (this.requestHelper.httpRequest) {
			const httpOptions: any = {
				method: requestOptions.method,
				url: requestOptions.url,
				headers,
				json: true,
				returnFullResponse: true,
			};

			if (requestOptions.qs) httpOptions.qs = requestOptions.qs;
			
			if (requestOptions.form) {
				// Manually encode form data as URL search parameters for POST requests
				const params = new URLSearchParams();
				for (const [key, value] of Object.entries(requestOptions.form)) {
					if (value !== undefined && value !== null) {
						params.append(key, String(value));
					}
				}
				httpOptions.body = params.toString();
				httpOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
				httpOptions.json = false;
			} else if (requestOptions.body) {
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
				const response = await this.requestHelper.httpRequest(httpOptions);
				
				// Extract headers and body
				const responseHeaders = response.headers || {};
				let responseBody = response.body;
				
				// Parse cookies
				this.extractCookies(responseHeaders);
				
				// Handle JSON parsing if we disabled auto-parsing
				if (typeof responseBody === 'string' && responseBody.trim().startsWith('{')) {
					try {
						responseBody = JSON.parse(responseBody);
					} catch (e) {
						// Not valid JSON, return as is
					}
				}
				
				// Check for MediaWiki API errors in the body
				if (responseBody && responseBody.error) {
					const apiError = responseBody.error;
					throw new Error(`MediaWiki API Error: ${apiError.code} - ${apiError.info}`);
				}
				
				return responseBody;
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
		
		// Ensure headers are passed to fallback
		requestOptions.headers = headers;

		return this.requestHelper.request(requestOptions);
	}

	async login(): Promise<any> {
		if (!this.credentials?.username || !this.credentials?.password) {
			return null;
		}

		try {
			// 1. Get login token
			const tokenRes = await this.request({
				method: 'GET',
				url: '/api.php',
				qs: {
					action: 'query',
					meta: 'tokens',
					type: 'login',
					format: 'json',
				},
			});

			const loginToken = tokenRes?.query?.tokens?.logintoken;
			if (!loginToken) {
				throw new Error('Failed to retrieve login token');
			}

			// 2. Login
			return await this.request({
				method: 'POST',
				url: '/api.php',
				form: {
					action: 'login',
					lgname: this.credentials.username,
					lgpassword: this.credentials.password,
					lgtoken: loginToken,
					format: 'json',
				},
			});
		} catch (error: any) {
			console.warn('MediaWiki login failed, attempting to continue with Basic Auth only:', error.message);
			return null;
		}
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
					type: 'csrf',
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
					type: 'csrf',
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
