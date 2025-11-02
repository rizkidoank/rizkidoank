import * as fs from "fs";
import { Gitlab } from "@gitbeaker/rest";
import { GoogleGenAI } from "@google/genai";
import { Octokit } from "octokit";
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

const TOPLANG_START_TAG = "<!-- LANG START -->";
const TOPLANG_END_TAG = "<!-- LANG END -->";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SUMMARY_START_TAG = "<!-- SUMMARY START -->";
const SUMMARY_END_TAG = "<!-- SUMMARY END -->";

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

async function fetchBlogPosts(): Promise<[]> {
  const parser: Parser<any, BlogPost> = new Parser();
  let feed;

  try {
    feed = await parser.parseURL(RSS_FEED_URL);
  } catch (error) {
    console.error(
      `Failed to fetch/parse RSS feed: ${(error as Error).message}`
    );
    return [];
  }

  const recentPosts = feed.items
    .filter(
      (item: { title: any; link: any }): item is BlogPost =>
        !!item.title && !!item.link
    )
    .slice(0, MAX_POSTS);

  if (recentPosts.length === 0) {
    console.log("No valid posts found. Skipping blog update.");
    return [];
  }

  return recentPosts;
}
// --- Task 1: Update Blog Posts ---
async function updateBlogPosts(readmeContent: string): Promise<string> {
  console.log("--- START: Updating Blog Posts ---");
  const recentPosts = await fetchBlogPosts();

  const postList = recentPosts
    .map(
      (item: { title: string; link: string }) =>
        `- [${item.title!}](${item.link!})`
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

// Task 3 : Activities
const GH_USERNAME = process.env.GH_USERNAME!;
const octokit = new Octokit({ auth: process.env.GH_TOKEN });

async function fetchGithubActivities(): Promise<{
  languages: Record<string, number>;
  commitMessages: string[];
}> {
  let languages: Record<string, number> = {};
  let commitMessages: string[] = [];
  let topLanguages: Record<string, number> = {};
  const MIN_COMMIT_COUNT = 50;
  let totalEventsProcessed = 0;
  const MAX_EVENTS_TO_PROCESS = 500;

  const repos = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "pushed",
    per_page: 100,
    affiliation: "owner",
  });

  let totalBytes = 0;

  for (const repo of repos.data) {
    if (repo.fork || !repo.language) continue;
    if (repo.size === 0) continue;
    try {
      const langResponse = await octokit.rest.repos.listLanguages({
        owner: repo.owner.login,
        repo: repo.name,
      });

      for (const [language, bytes] of Object.entries(langResponse.data)) {
        languages[language] = (languages[language] || 0) + (bytes as number);
        totalBytes += bytes as number;
      }

      const topLangs = Object.entries(languages);
      topLangs.map(([language, bytes]) => {
        const percentage: number = (bytes / totalBytes) * 100;
        topLanguages[language] = percentage;
      });
    } catch (e: any) {
      console.warn(`Could not fetch languages for ${repo.name}: ${e.message}`);
    }
  }
  console.log("GitHub language stats compiled.");

  console.log("Fetching GitHub activity events (paginating)...");
  const iterator = octokit.paginate.iterator(
    octokit.rest.activity.listEventsForAuthenticatedUser,
    {
      username: process.env.GH_USERNAME,
      per_page: 20,
    }
  );

  for await (const { data: events } of iterator) {
    totalEventsProcessed += events.length;

    const pushEvents = events.filter(
      (event: { type: string }) => event.type === "PushEvent"
    );

    for (const event of pushEvents) {
      const payload = (event as any).payload;
      const repoName = (event as any).repo.name;
      const [owner, repo] = repoName.split("/");

      if (!owner || !repo || owner !== GH_USERNAME) {
        continue;
      }

      if (payload.commits && payload.commits.length > 0) {
        payload.commits.forEach((commit: any) => {
          commitMessages.push(commit.message);
        });
      } else if (payload.head && payload.before) {
        try {
          const compareResponse = await octokit.rest.repos.compareCommits({
            owner: owner,
            repo: repo,
            base: payload.before,
            head: payload.head,
          });
          if (compareResponse.data.commits) {
            compareResponse.data.commits.forEach(
              (commit: { commit: { message: string } }) => {
                commitMessages.push(commit.commit.message);
              }
            );
          }
        } catch (e: any) {
          console.warn(
            `Failed to compare commits for ${repoName}: ${e.message}`
          );
        }
      }

      if (commitMessages.length >= MIN_COMMIT_COUNT) {
        break;
      }
    }

    if (commitMessages.length >= MIN_COMMIT_COUNT) {
      console.log(
        `Collected ${commitMessages.length} commits. Stopping pagination.`
      );
      break;
    }

    if (totalEventsProcessed >= MAX_EVENTS_TO_PROCESS) {
      console.warn(
        `Processed ${totalEventsProcessed} events but found only ${commitMessages.length} commits. Stopping pagination.`
      );
      break;
    }
  }

  console.log("GitHub activity themes compiled.");
  return {
    languages: topLanguages,
    commitMessages: [...new Set(commitMessages)].slice(0, 50),
  };
}

async function updateTopLanguages(readmeContent: string): Promise<string> {
  console.log("--- START: Updating Top Languages ---");
  let gh = await fetchGithubActivities();

  let topLanguagesContent: string = "|Language|Percentage|";
  topLanguagesContent += "\n|---|---|\n";
  const topLangs: string = Object.entries(gh.languages)
    .sort(([, a], [, b]) => b - a)
    .map(([language, percentage]) => {
      return `| ${language} | ${percentage.toFixed(2)}% |`;
    })
    .join("\n");
  topLanguagesContent += topLangs;

  return updateReadmeBlock(
    readmeContent,
    TOPLANG_START_TAG,
    TOPLANG_END_TAG,
    topLanguagesContent
  );
}

async function updateSummary(readmeContent: string): Promise<string> {
  console.log("--- START: Updating Profile Summary ---");

  let summaryContent: string = "";
  const buffer = Buffer.from(process.env.RESUME_B64 as string, "base64");
  const decodedResume = buffer.toString("utf-8");

  const recentPosts = await fetchBlogPosts();
  const postList = recentPosts
    .map(
      (item: { title: string; link: string }) =>
        `- [${item.title!}](${item.link!})`
    )
    .join("\n");

  const decodedPrompt = Buffer.from(
    process.env.PROMPT_B64 as string,
    "base64"
  ).toString("utf-8");

  const prompt = `
  ${decodedPrompt}
  
  Input Data:
  1. Resume (Markdown):
    \`\`\`markdown
    ${decodedResume}
    \`\`\`
  2. Recent Blog Posts:
    \`\`\`
  ${postList}
    \`\`\`
  `;

  try {
    const result: any = await genAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.5,
        maxOutputTokens: 100,
      },
    });

    const summary = result.text.replace(/```/g, "").trim();

    console.log("AI Summary Generated Successfully.");
    summaryContent = summary;
  } catch (e: any) {
    console.error(
      "An error occurred during Gemini API call for summary:",
      e.message
    );
    summaryContent = Buffer.from(
      process.env.DEFAULT_SUMMARY_B64 as string,
      "base64"
    ).toString("utf-8");
  }
  console.log("--- END: Updating Profile Summary ---");
  return updateReadmeBlock(
    readmeContent,
    SUMMARY_START_TAG,
    SUMMARY_END_TAG,
    summaryContent
  );
}

async function main(): Promise<void> {
  console.log("Starting full README update sequence...");
  let readmeContent = fs.readFileSync(README_FILE_PATH, "utf8");
  const originalContent = readmeContent;

  // 1. Run Blog Update
  readmeContent = await updateBlogPosts(readmeContent);

  // 2. Run Quote Update on the result of the blog update
  readmeContent = await updateDailyQuote(readmeContent);

  // 3. Run Top Languages update based on github
  readmeContent = await updateTopLanguages(readmeContent);

  // 4. Generate summary based on some inputs
  readmeContent = await updateSummary(readmeContent);

  // 4. Commit logic
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
  console.error("An unhandled error occurred:", err as Error);
  process.exit(1);
});
