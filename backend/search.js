const axios = require("axios");
const cheerio = require("cheerio");

const DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_SEARCH_URL = "https://lite.duckduckgo.com/lite/";
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
  requiresWebSearch,
  referencesUploadedDocuments,
  searchDuckDuckGo,
};
