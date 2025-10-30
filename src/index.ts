import * as fs from 'fs';
import Parser from 'rss-parser';

const README_FILE_PATH='README.md';
const RSS_FEED_URL = "https://rizkidoank.com/index.xml";
const START_TAG = "<!-- BLOG START -->";
const END_TAG = "<!-- BLOG END -->";
const MAX_POSTS = 5;

interface BlogPost {
  title: string | undefined;
  link: string | undefined;
}

async function updateReadme(): Promise<void> {
  console.log("Fetching and parsing RSS feed...");
  const parser: Parser<any, BlogPost> = new Parser();
  let feed;

  try {
    feed = await parser.parseURL(RSS_FEED_URL);
  } catch (error) {
    console.error(
      `Failed to fetch or parse RSS feed: ${(error as Error).message}`
    );
    return;
  }

  const recentPosts = feed.items
    .filter((item: { title: any; link: any; }): item is BlogPost => !!item.title && !!item.link)
    .slice(0, MAX_POSTS);

  if (recentPosts.length === 0) {
    console.log("No valid posts found in the feed. Skipping update.");
    return;
  }

  const postList = recentPosts
    .map((item: { title: any; link: any; }) => {
      const title = item.title!;
      const url = item.link!;

      return `- [${title}](${url})`;
    })
    .join("\n");

  const newContent = `${postList}`;

  console.log("Reading README.md...");
  let readmeContent = fs.readFileSync(README_FILE_PATH, "utf8");

  const start = readmeContent.indexOf(START_TAG);
  const end = readmeContent.indexOf(END_TAG, start);

  if (start === -1 || end === -1) {
    throw new Error(
      `Could not find required tags ${START_TAG} and ${END_TAG} in README.md`
    );
  }

  const newBlock = `${START_TAG}\n${newContent}\n${END_TAG}`;

  const beforeBlock = readmeContent.substring(0, start);
  const afterBlock = readmeContent.substring(end + END_TAG.length);

  const updatedReadme = `${beforeBlock}${newBlock}${afterBlock}`;

  if (updatedReadme === readmeContent) {
    console.log("README.md content has not changed. Skipping commit.");
  } else {
    console.log("Writing updated README.md...");
    fs.writeFileSync(README_FILE_PATH, updatedReadme);
    console.log("README.md updated successfully.");
  }
  process.exit(0);
}

updateReadme().catch((err) => {
  console.error("An error occurred during update:", err.message);
  process.exit(1);
});