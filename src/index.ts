import * as fs from "fs";
import Parser from "rss-parser";

const README_FILE_PATH = "README.md";

// Blog Post Constants
const RSS_FEED_URL = "https://rizkidoank.com/index.xml";
const BLOG_START_TAG = "<!-- BLOG START -->";
const BLOG_END_TAG = "<!-- BLOG END -->";
const MAX_POSTS = 5;

// Quote Constants
const QUOTE_API_URL = "https://zenquotes.io/api/random";
const QUOTE_START_TAG = "<!-- QUOTE START -->";
const QUOTE_END_TAG = "<!-- QUOTE END -->";

interface BlogPost {
  title: string | undefined;
  link: string | undefined;
}

interface Quote {
  content: string;
  author: string;
}

// --- Helper Function to Update a specific block in README ---
function updateReadmeBlock(
  readmeContent: string,
  startTag: string,
  endTag: string,
  newContent: string
): string {
  const start = readmeContent.indexOf(startTag);
  const end = readmeContent.indexOf(endTag, start);

  if (start === -1 || end === -1) {
    console.error(
      `ERROR: Could not find required tags ${startTag} and ${endTag}. Skipping this block.`
    );
    return readmeContent;
  }

  const newBlock = `${startTag}\n${newContent}\n${endTag}`;

  const beforeBlock = readmeContent.substring(0, start);
  const afterBlock = readmeContent.substring(end + endTag.length);

  return `${beforeBlock}${newBlock}${afterBlock}`;
}

// --- Task 1: Update Blog Posts ---
async function updateBlogPosts(readmeContent: string): Promise<string> {
  console.log("--- START: Updating Blog Posts ---");
  const parser: Parser<any, BlogPost> = new Parser();
  let feed;

  try {
    feed = await parser.parseURL(RSS_FEED_URL);
  } catch (error) {
    console.error(
      `Failed to fetch/parse RSS feed: ${(error as Error).message}`
    );
    return readmeContent;
  }

  const recentPosts = feed.items
    .filter(
      (item: { title: any; link: any }): item is BlogPost =>
        !!item.title && !!item.link
    )
    .slice(0, MAX_POSTS);

  if (recentPosts.length === 0) {
    console.log("No valid posts found. Skipping blog update.");
    return readmeContent;
  }

  const postList = recentPosts
    .map(
      (item: { title: any; link: any }) => `- [${item.title!}](${item.link!})`
    )
    .join("\n");
  const newContent = `${postList}`;

  console.log("--- END: Blog Posts Updated ---");
  return updateReadmeBlock(
    readmeContent,
    BLOG_START_TAG,
    BLOG_END_TAG,
    newContent
  );
}

// --- Task 2: Update Quote of the Day ---
async function updateDailyQuote(readmeContent: string): Promise<string> {
  console.log("--- START: Updating Daily Quote ---");
  let quote: Quote;

  try {
    const response = await fetch(QUOTE_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch quote. Status: ${response.status}`);
    }
    const res = await response.json();
    quote = {
      author: res[0].a,
      content: res[0].q,
    };
  } catch (error) {
    console.error(`Failed to fetch quote: ${(error as Error).message}`);
    return readmeContent;
  }

  const quoteText = `> "${quote.content}" - **${quote.author}**`;
  const newContent = `${quoteText}`;

  console.log("--- END: Daily Quote Updated ---");
  return updateReadmeBlock(
    readmeContent,
    QUOTE_START_TAG,
    QUOTE_END_TAG,
    newContent
  );
}

// --- Main Execution Function ---
async function main(): Promise<void> {
  console.log("Starting full README update sequence...");
  let readmeContent = fs.readFileSync(README_FILE_PATH, "utf8");
  const originalContent = readmeContent;

  // 1. Run Blog Update
  readmeContent = await updateBlogPosts(readmeContent);

  // 2. Run Quote Update on the result of the blog update
  readmeContent = await updateDailyQuote(readmeContent);

  // 3. Commit logic
  if (readmeContent === originalContent) {
    console.log(
      "README.md content has not changed after all updates. Skipping commit."
    );
  } else {
    console.log("Writing updated README.md...");
    fs.writeFileSync(README_FILE_PATH, readmeContent);
    console.log("README.md updated successfully.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("An unhandled error occurred:", (err as Error).message);
  process.exit(1);
});
