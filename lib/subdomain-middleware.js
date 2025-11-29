/**
 * Subdomain Multi-Tenancy Middleware
 * Extracts company identifier from subdomain and sets req.companySlug and req.companyId
 */

const extractSubdomain = (hostname) => {
    if (!hostname) return null;

    // Remove port if present
    const host = hostname.split(':')[0];

    // List of root domains to ignore
    const rootDomains = [
        'localhost',
        'vercel.app',
        'onrender.com',
        '127.0.0.1'
    ];

    const parts = host.split('.');

    // If it's a root domain or IP, no subdomain
    if (parts.length <= 2 || rootDomains.some(root => host.includes(root) && parts.length === 3)) {
        return null;
    }

    // Get the first part as subdomain
    const subdomain = parts[0];

    // Ignore common subdomains
    const ignoredSubdomains = ['www', 'api', 'admin'];
    if (ignoredSubdomains.includes(subdomain)) {
        return null;
    }

    return subdomain;
};

const subdomainMiddleware = (pool) => {
    return async (req, res, next) => {
        try {
            const hostname = req.hostname || req.headers.host;
            const subdomain = extractSubdomain(hostname);

            console.log(`Hostname: ${hostname}, Extracted subdomain: ${subdomain}`);

            if (subdomain) {
                // Look up company by slug
                const [companies] = await pool.execute(
                    'SELECT id, name, slug, domain FROM companies WHERE slug = ?',
                    [subdomain]
                );

                if (companies.length > 0) {
                    req.companyId = companies[0].id;
                    req.companySlug = companies[0].slug;
                    req.companyName = companies[0].name;
                    req.companyDomain = companies[0].domain;
                } else {
                    // Subdomain exists but company not found
                    console.warn(`Company not found for subdomain: ${subdomain}`);
                    req.companyId = null;
                    req.companySlug = null;
                }
            } else {
                // No subdomain - could be main app or fallback
                // Check if companyId provided in query/headers
                const companyId = req.query.companyId || req.headers['x-company-id'] || (req.body && req.body.companyId);
                if (companyId) {
                    req.companyId = parseInt(companyId);
                } else {
                    req.companyId = null;
                }
            }

            next();
        } catch (error) {
            console.error('Subdomain middleware error:', error);
            next(error);
        }
    };
};

module.exports = { subdomainMiddleware, extractSubdomain };
