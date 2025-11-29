/**
 * Utility functions for multi-tenancy
 */

/**
 * Generate a URL-friendly slug from a string
 * @param {string} text - The text to convert to slug
 * @returns {string} URL-friendly slug
 */
const generateSlug = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Replace spaces with -
        .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
        .replace(/\-\-+/g, '-')      // Replace multiple - with single -
        .replace(/^-+/, '')           // Trim - from start of text
        .replace(/-+$/, '');          // Trim - from end of text
};

/**
 * Check if slug is unique in database
 * @param {object} pool - MySQL connection pool
 * @param {string} slug - Slug to check
 * @param {number} excludeId - Company ID to exclude from check (for updates)
 * @returns {Promise<boolean>} True if unique, false otherwise
 */
const isSlugUnique = async (pool, slug, excludeId = null) => {
    try {
        let query = 'SELECT id FROM companies WHERE slug = ?';
        const params = [slug];

        if (excludeId) {
            query += ' AND id != ?';
            params.push(excludeId);
        }

        const [results] = await pool.execute(query, params);
        return results.length === 0;
    } catch (error) {
        console.error('Error checking slug uniqueness:', error);
        return false;
    }
};

/**
 * Generate a unique slug for a company
 * @param {object} pool - MySQL connection pool
 * @param {string} baseName - Base name to generate slug from
 * @param {number} excludeId - Company ID to exclude from check
 * @returns {Promise<string>} Unique slug
 */
const generateUniqueSlug = async (pool, baseName, excludeId = null) => {
    let slug = generateSlug(baseName);
    let counter = 1;
    let finalSlug = slug;

    // Keep trying until we find a unique slug
    while (!(await isSlugUnique(pool, finalSlug, excludeId))) {
        finalSlug = `${slug}-${counter}`;
        counter++;

        // Safety check to prevent infinite loop
        if (counter > 1000) {
            finalSlug = `${slug}-${Date.now()}`;
            break;
        }
    }

    return finalSlug;
};

/**
 * Get subdomain URL for a company
 * @param {string} slug - Company slug
 * @param {string} baseDomain - Base domain (e.g., 'vercel.app', 'yourdomain.com')
 * @returns {string} Full subdomain URL
 */
const getSubdomainUrl = (slug, baseDomain = 'vercel.app') => {
    return `https://${slug}.${baseDomain}`;
};

module.exports = {
    generateSlug,
    isSlugUnique,
    generateUniqueSlug,
    getSubdomainUrl
};
