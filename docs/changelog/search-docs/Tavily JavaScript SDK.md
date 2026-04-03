> ## Documentation Index
> Fetch the complete documentation index at: https://docs.tavily.com/llms.txt
> Use this file to discover all available pages before exploring further.

# SDK Reference

> Integrate Tavily's powerful APIs natively in your JavaScript/TypeScript projects.

## Instantiating a client

To interact with Tavily in JavaScript, you must instatiate a client with your API key. Our client is asynchronous by default.

Once you have instantiated a client, call one of our supported methods (detailed below) to access the API.

```javascript  theme={null}
const { tavily } = require("@tavily/core");

client = tavily({ apiKey: "tvly-YOUR_API_KEY" });
```

### Proxies

If you would like to specify a proxy to be used when making requests, you can do so by passing in a proxy parameter on client instantiation.

Proxy configuration is available in both the synchronous and asynchronous clients.

```javascript  theme={null}
const { tavily } = require("@tavily/core");

const proxies = {
  http: "<your HTTP proxy>",
  https: "<your HTTPS proxy>",
};

client = tavily({ apiKey: "tvly-YOUR_API_KEY", proxies });
```

Alternatively, you can specify which proxies to use by setting the `TAVILY_HTTP_PROXY` and `TAVILY_HTTPS_PROXY` variables in your environment file.

### Project Tracking

You can attach a Project ID to your client to organize and track API usage by project. This is useful when a single API key is used across multiple projects.

```javascript  theme={null}
const { tavily } = require("@tavily/core");

const client = tavily({
  apiKey: "tvly-YOUR_API_KEY",
  projectId: "your-project-id"
});
```

Alternatively, you can set the `TAVILY_PROJECT` environment variable:

```javascript  theme={null}
process.env.TAVILY_PROJECT = "your-project-id";

const client = tavily({ apiKey: "tvly-YOUR_API_KEY" });
```

All requests made with this client will include the Project ID, allowing you to filter by project in the /logs endpoint and platform usage dashboard.

## Tavily Search

<Tip>
  **NEW!** Try our interactive [API
  Playground](https://app.tavily.com/playground) to see each parameter in
  action, and generate ready-to-use JavaScript snippets.
</Tip>

You can access Tavily Search in JavaScript through the client's `search` function.

### Parameters

| Parameter                  | Type                  | Description                                                  | Default     |
| :------------------------- | :-------------------- | :----------------------------------------------------------- | :---------- |
| `query` **(required)**     | `string`              | The query to run a search on.                                | —           |
| `auto_parameters`          | `boolean`             | When `auto_parameters` is enabled, Tavily automatically configures search parameters based on your query's content and intent. You can still set other parameters manually, and your explicit values will override the automatic ones. The parameters `include_answer`, `include_raw_content`, and `max_results` must always be set manually, as they directly affect response size. Note: `search_depth` may be automatically set to advanced when it's likely to improve results. This uses 2 API credits per request. To avoid the extra cost, you can explicitly set `search_depth` to `basic`. | `false`     |
| `searchDepth`              | `string`              | The depth of the search. It can be `"basic"` or `"advanced"`. `"advanced"` search is tailored to retrieve the most relevant sources and `content` snippets for your query, while `"basic"` search provides generic content snippets from each source. | `"basic"`   |
| `topic`                    | `string`              | The category of the search. Determines which agent will be used. Supported values are `"general"` , `"news"` and `"finance"`. | `"general"` |
| `timeRange`                | `string`              | The time range back from the current date based on publish date or last updated date. Accepted values include `"day"`, `"week"`, `"month"`, `"year"` or shorthand values `"d"`, `"w"`, `"m"`, `"y"`. | —           |
| `startDate`                | `string`              | Will return all results after the specified start date based on publish date or last updated date. Required to be written in the format YYYY-MM-DD | —           |
| `endDate`                  | `string`              | Will return all results before the specified end date based on publish date or last updated date. Required to be written in the format YYYY-MM-DD. | —           |
| `maxResults`               | `number`              | The maximum number of search results to return. It must be between `0` and `20`. | `5`         |
| `chunksPerSource`          | `number`              | Chunks are short content snippets (maximum 500 characters each) pulled directly from the source. Use `chunksPerSource` to define the maximum number of relevant chunks returned per source and to control the `content` length. Chunks will appear in the `content` field as: `<chunk 1> [...] <chunk 2> [...] <chunk 3>`. Available only when `searchDepth` is `"advanced"`. | `3`         |
| `includeImages`            | `boolean`             | Include images in the response. Returns both a top-level `images` list of query-related images and an `images` array inside each result object with images extracted from that specific source. | `false`     |
| `includeImageDescriptions` | `boolean`             | Include a list of query-related images and their descriptions in the response. | `false`     |
| `includeAnswer`            | `boolean` or `string` | Include an answer to the query generated by an LLM based on search results. A `"basic"` (or `true`) answer is quick but less detailed; an `"advanced"` answer is more detailed. | `false`     |
| `includeRawContent`        | `boolean` or `string` | Include the cleaned and parsed HTML content of each search result. `"markdown"` or `True` returns search result content in markdown format. `"text"` returns the plain text from the results and may increase latency. | `False`     |
| `includeDomains`           | `string[]`            | A list of domains to specifically include in the search results. Maximum 300 domains. | `[]`        |
| `excludeDomains`           | `string[]`            | A list of domains to specifically exclude from the search results. Maximum 150 domains. | `[]`        |
| `country`                  | `string`              | Boost search results from a specific country. This will prioritize content from the selected country in the search results. Available only if topic is `general`. | —           |
| `timeout`                  | `number`              | A timeout to be used in requests to the Tavily API.          | `60`        |
| `exactMatch`               | `boolean`             | Ensure that only search results containing the exact quoted phrase(s) in your query are returned, bypassing synonyms or semantic variations. Wrap target phrases in quotes (e.g. `"John Smith"`). Punctuation is typically ignored inside quotes. | `false`     |
| `includeFavicon`           | `boolean`             | Whether to include the favicon URL for each result.          | `false`     |
| `includeUsage`             | `boolean`             | Whether to include credit usage information in the response. | `false`     |

### Response format

The response object you receive will be in the following format:

| Key                  | Type                          | Description                                                  |
| :------------------- | :---------------------------- | :----------------------------------------------------------- |
| `results`            | `Result[]`                    | A list of sorted search results ranked by relevancy.         |
| `query`              | `string`                      | Your search query.                                           |
| `responseTime`       | `number`                      | Your search result response time.                            |
| `requestId`          | `string`                      | A unique request identifier you can share with customer support to help resolve issues with specific requests. |
| `answer` (optional)  | `string`                      | The answer to your search query, generated by an LLM based on Tavily's search results. This is only available if `includeAnswer` is set to `true`. |
| `images` (optional)  | `string[]` or `ImageResult[]` | This is only available if `includeImages` is set to `true`. A list of query-related image URLs. If `includeImageDescriptions` is set to `true`, each entry will be an `ImageResult`. When `includeImages` is `true`, each result in `results` will also contain its own `images` list with images extracted from that specific source. |
| `favicon` (optional) | `string`                      | The favicon URL for the search result.                       |

### Results

Each result in the `results` list will be in the following `Result` format:

| Key                        | Type                          | Description                                                  |
| :------------------------- | :---------------------------- | :----------------------------------------------------------- |
| `title`                    | `string`                      | The title of the search result.                              |
| `url`                      | `string`                      | The URL of the search result.                                |
| `content`                  | `string`                      | The most query-related content from the scraped URL. Tavily uses proprietary AI to extract the most relevant content based on context quality and size. |
| `score`                    | `float`                       | The relevance score of the search result.                    |
| `rawContent` (optional)    | `string`                      | The parsed and cleaned HTML content of the site. This is only available if `includeRawContent` is set to `true`. |
| `publishedDate` (optional) | `string`                      | The publication date of the source. This is only available if the search `topic` is set to `news`. |
| `favicon` (optional)       | `string`                      | The favicon URL for the result.                              |
| `images` (optional)        | `string[]` or `ImageResult[]` | Images extracted from this search result. Only included when `includeImages` is set to `true`. If `includeImageDescriptions` is set to `true`, each entry will be an `ImageResult`. |

#### Image Results

Each image in the `images` list will be in the following `ImageResult` format:

| Key                      | Type     | Description                                                  |
| :----------------------- | :------- | :----------------------------------------------------------- |
| `url`                    | `string` | The URL of the image.                                        |
| `description` (optional) | `string` | This is only available if `includeImageDescriptions` is set to `true`. An LLM-generated description of the image. |

### Example

<AccordionGroup>
  <Accordion title="Request">
    ```javascript  theme={null}
    const { tavily } = require("@tavily/core");

    // Step 1. Instantiating your Tavily client
    const tvly = tavily({ apiKey: "tvly-YOUR_API_KEY" });
    
    // Step 2. Executing a simple search query
    const response = await tvly.search("Who is Leo Messi?");
    
    // Step 3. That's it! You've done a Tavily Search!
    console.log(response);
    ```
  </Accordion>

  <Accordion title="Response">
    ```json  theme={null}
    {
      "query": "Who is Leo Messi?",
      "images": [
        {
          "url": "Image 1 URL",
          "description": "Image 1 Description"
        },
        {
          "url": "Image 2 URL",
          "description": "Image 2 Description"
        },
        {
          "url": "Image 3 URL",
          "description": "Image 3 Description"
        },
        {
          "url": "Image 4 URL",
          "description": "Image 4 Description"
        },
        {
          "url": "Image 5 URL",
          "description": "Image 5 Description"
        }
      ],
      "results": [
        {
          "title": "Source 1 Title",
          "url": "Source 1 URL",
          "content": "Source 1 Content",
          "score": 0.99,
          "favicon": "https://source1.com/favicon.ico",
          "images": [
            {
              "url": "Source 1 Image 1 URL",
              "description": "Source 1 Image 1 Description"
            },
            {
              "url": "Source 1 Image 2 URL",
              "description": "Source 1 Image 2 Description"
            }
          ]
        },
        {
          "title": "Source 2 Title",
          "url": "Source 2 URL",
          "content": "Source 2 Content",
          "score": 0.97,
          "favicon": "https://source2.com/favicon.ico",
          "images": []
        }
      ],
      "responseTime": 1.09,
      "requestId": "123e4567-e89b-12d3-a456-426614174111"
    }
    ```
  </Accordion>
</AccordionGroup>