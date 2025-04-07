// TemplateRepository.js
const axios = require('axios');
const { initServerConfig } = require('./configuration');

class TemplateRepository {
    constructor(baseURL) {
        this.repo = baseURL;
        this.baseURL = '';
        this.version = '';
        this.description = '';
        this.templates = [];
    }

    // Helper function to parse headers from script headers using markers
    parseHeader(scriptContent) {
        // Regular expression to match the header between #start-params and #end-params
        const headerRegex = /#start-params([\s\S]*?)#end-params/;
        const match = scriptContent.match(headerRegex);
        
        if (!match) {
            logger.debug("No header found between #start-params and #end-params.");
            return { description: '', parameters: [] };
        }
        
        // Extract the header content
        const headerContent = match[1]
            .split('\n') // Split by new lines
            .map(line => line.trim().replace(/^#/, '')) // Remove leading # and trim spaces
            .filter(line => line.length > 0); // Remove empty lines
        
        if (headerContent.length === 0) {
            logger.debug("Empty header content.");
            return { description: '', parameters: [] };
        }
        
        // First line is the description
        const description = headerContent.shift();
        logger.debug(`Description: ${description}`);
        
        // The rest are parameters
        const parameters = headerContent;
        parameters.forEach(param => logger.debug(`Parameter: ${param}`));
        
        return { description, parameters };
    }
      

    // Fetch template repository and initialize the class properties
    async init() {
        try {
            logger.info(`Initializing Script Templates from [${this.repo}]`);
            const response = await axios.get(this.repo);
            const data = response.data;
            //logger.warn("-----------------");
            logger.debug(data);
            //logger.warn("-----------------");
            // Set baseURL, description, version
            this.baseURL = data.baseurl;
            this.description = data.description;
            this.version = data.version;

            // Parse each template
            this.templates = await Promise.all(data.templates.map(async (template) => {
                logger.debug(`Adding template [${template.filename}]`);
                var content = await this.fetchFileContent(template.filename);
                const header = this.parseHeader(content);
                return {
                    name: template.filename,
                    content: content, // Fetch the content
                    header: header,
                    description: header ? header.description : '', // Set description
                    parameters: header ? header.parameters : '',   // Set parameters
                };
            }));
        } catch (error) {
            console.error('Error fetching template repository, disabling templates capability:', error);
            serverConfig.templates.enabled="false";
        }
    }

    // Fetch file content from the baseURL and filename
    async fetchFileContent(filename) {
        try {
            const fileUrl = `${this.baseURL}/${filename}`;
            const response = await axios.get(fileUrl);
            return response.data;
        } catch (error) {
            console.error(`Error fetching file content for ${filename}:`, error);
            return null;
        }
    }

    // Get all templates
    getTemplates() {
        return this.templates;
    }

    // Get a template by name
    getTemplateByName(name) {
        return this.templates.find((template) => template.name === name);
    }

    // Get a list of all script names
    getTemplateNames() {
        return this.templates.map(template => template.name);
    }
}

module.exports = TemplateRepository;
