const axios = require("axios");
const cheerio = require("cheerio");

const DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";

function requiresWebSearch(query) {
  const currentInfoPattern =
    /\b(latest|today|current|recent|news|price|weather|score|release|update)\b/i;
  return currentInfoPattern.test(query || "");
}

async function searchDuckDuckGo(query, limit = 5) {
  const response = await axios.get(DDG_HTML_SEARCH_URL, {
    params: {
      q: query,
      kl: "us-en",
    },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    timeout: 20000,
  });

  const $ = cheerio.load(response.data);
  const results = [];

  $(".result").each((index, element) => {
    if (index >= limit) {
      return false;
    }

    const title = $(element).find(".result__title").text().trim();
    const snippet = $(element).find(".result__snippet").text().trim();
    const url = $(element).find(".result__title a").attr("href");

    if (title && url) {
      results.push({ title, snippet, url });
    }
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
  searchDuckDuckGo,
};
