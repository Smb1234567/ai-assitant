const axios = require("axios");
const cheerio = require("cheerio");

const DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_SEARCH_URL = "https://lite.duckduckgo.com/lite/";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const SERPAPI_SEARCH_URL = "https://serpapi.com/search.json";
const DOCUMENT_REFERENCE_PATTERN =
  /\b(document|documents|doc|docs|pdf|file|files|manual|report|uploaded|upload|chunk|chunks|according to|in the document|in the file)\b/i;

function requiresWebSearch(query) {
  const currentInfoPattern =
    /\b(latest|today|current|recent|news|price|weather|score|release|update)\b/i;
  return currentInfoPattern.test(query || "");
}

function referencesUploadedDocuments(query) {
  return DOCUMENT_REFERENCE_PATTERN.test(query || "");
}

function getConfiguredSearchProvider() {
  if (process.env.BRAVE_SEARCH_API_KEY) {
    return "brave";
  }
  if (process.env.TAVILY_API_KEY) {
    return "tavily";
  }
  if (process.env.SERPAPI_API_KEY) {
    return "serpapi";
  }
  return "duckduckgo";
}

async function searchBrave(query, limit = 5) {
  const response = await axios.get(BRAVE_SEARCH_URL, {
    params: {
      q: query,
      count: limit,
      search_lang: "en",
      country: "us",
    },
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
    },
    timeout: 20000,
  });

  const items = response.data?.web?.results || [];
  return items.slice(0, limit).map((item) => ({
    title: item.title || item.url,
    snippet: item.description || "",
    url: item.url,
  }));
}

async function searchTavily(query, limit = 5) {
  const response = await axios.post(
    TAVILY_SEARCH_URL,
    {
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: limit,
      search_depth: "advanced",
      include_answer: false,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 20000,
    }
  );

  const items = response.data?.results || [];
  return items.slice(0, limit).map((item) => ({
    title: item.title || item.url,
    snippet: item.content || "",
    url: item.url,
  }));
}

async function searchSerpApi(query, limit = 5) {
  const response = await axios.get(SERPAPI_SEARCH_URL, {
    params: {
      engine: "google",
      q: query,
      num: limit,
      api_key: process.env.SERPAPI_API_KEY,
    },
    timeout: 20000,
  });

  const items = response.data?.organic_results || [];
  return items.slice(0, limit).map((item) => ({
    title: item.title || item.link,
    snippet: item.snippet || "",
    url: item.link,
  }));
}

async function searchDuckDuckGo(query, limit = 5) {
  const commonHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };

  try {
    const response = await axios.post(
      DDG_HTML_SEARCH_URL,
      new URLSearchParams({
        q: query,
        kl: "us-en",
      }).toString(),
      {
        headers: commonHeaders,
        timeout: 20000,
      }
    );

    const results = parseHtmlResults(response.data, limit);
    if (results.length > 0) {
      return results;
    }
  } catch (_error) {
    // Fall through to lite search.
  }

  const liteResponse = await axios.get(DDG_LITE_SEARCH_URL, {
    params: {
      q: query,
      kl: "us-en",
    },
    headers: {
      "User-Agent": commonHeaders["User-Agent"],
    },
    timeout: 20000,
  });

  return parseLiteResults(liteResponse.data, limit);
}

async function searchWeb(query, limit = 5) {
  const provider = getConfiguredSearchProvider();

  if (provider === "brave") {
    return {
      provider,
      results: await searchBrave(query, limit),
    };
  }

  if (provider === "tavily") {
    return {
      provider,
      results: await searchTavily(query, limit),
    };
  }

  if (provider === "serpapi") {
    return {
      provider,
      results: await searchSerpApi(query, limit),
    };
  }

  return {
    provider: "duckduckgo",
    results: await searchDuckDuckGo(query, limit),
  };
}

function normalizeDuckDuckGoUrl(url) {
  if (!url) {
    return "";
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    if (target) {
      return decodeURIComponent(target);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseHtmlResults(html, limit) {
  const $ = cheerio.load(html);
  const results = [];

  $(".result").each((index, element) => {
    if (index >= limit) {
      return false;
    }

    let link = $(element).find(".result__title a").first();
    if (!link.length) {
      link = $(element).find("a.result__a").first();
    }
    const title = link.text().trim();
    const snippet =
      $(element).find(".result__snippet").text().trim() ||
      $(element).find(".result__extras__url").text().trim();
    const url = normalizeDuckDuckGoUrl(link.attr("href"));

    if (title && url) {
      results.push({ title, snippet, url });
    }
  });

  return results;
}

function parseLiteResults(html, limit) {
  const $ = cheerio.load(html);
  const results = [];

  $("a.result-link, a[href]").each((_, element) => {
    if (results.length >= limit) {
      return false;
    }

    const link = $(element);
    const title = link.text().trim();
    const href = link.attr("href");
    const url = normalizeDuckDuckGoUrl(href);

    if (!title || !url) {
      return;
    }

    if (
      title === "Next" ||
      title === "Previous" ||
      url.includes("/lite/") ||
      url.includes("duckduckgo.com/feedback")
    ) {
      return;
    }

    const snippet = link
      .closest("tr")
      .nextAll("tr")
      .find(".result-snippet")
      .first()
      .text()
      .trim();

    results.push({ title, snippet, url });
  });

  return results;
}

function buildSearchContext(results) {
  return results
    .map(
      (result, index) =>
        `${index + 1}. ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}`
    )
    .join("\n\n");
}

module.exports = {
  buildSearchContext,
  getConfiguredSearchProvider,
  requiresWebSearch,
  referencesUploadedDocuments,
  searchDuckDuckGo,
  searchWeb,
};
