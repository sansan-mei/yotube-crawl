import { writeFileSync } from "node:fs";

const baseUrl = "https://youtube.googleapis.com/youtube/v3/commentThreads";
const apiKey = process.env.key;
const id = process.env.id;

/**
 * 获取视频评论直到达到指定数量
 * @param videoId YouTube视频ID
 * @param targetCount 需要获取的评论目标数量
 * @param order 评论排序方式，默认为'relevance'（最热门），可选'time'（时间顺序）
 * @returns 评论数组
 */
const fetchCommentsUntilCount = async (
  videoId: string = id,
  targetCount: number = 12000,
  order: "relevance" | "time" = "relevance",
): Promise<IComment[]> => {
  let comments: IComment[] = [];
  let nextPageToken: string | undefined = undefined;

  try {
    while (comments.length < targetCount) {
      const params = new URLSearchParams({
        part: "snippet,replies",
        videoId: videoId,
        key: apiKey!,
        maxResults: "500",
        order: order,
      });

      // 添加页码令牌（如果有）
      if (nextPageToken) {
        params.append("pageToken", nextPageToken);
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 800 + Math.random() * 200),
      );
      const response = await fetch(`${baseUrl}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`API错误: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as YouTubeCommentResponse;

      // 提取评论数据
      const newComments = data.items.map((item) => ({
        id: item.id,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
        likeCount: item.snippet.topLevelComment.snippet.likeCount,
        replyCount: item.snippet.totalReplyCount,
        replies: item.replies?.comments,
        nextPageToken: data.nextPageToken,
      }));

      comments = [...comments, ...newComments];
      console.log(`已获取 ${comments.length} 条评论`);

      // 更新nextPageToken
      nextPageToken = data.nextPageToken;

      // 如果没有更多页面或已经达到目标数量，退出循环
      if (!nextPageToken || comments.length >= targetCount) {
        console.log(`已收集全部公开评论 ${comments.length} 条`);
        break;
      }

      // 添加延迟避免触发API限制
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 如果超过目标数量，截取到目标数量
    if (comments.length > targetCount) {
      comments = comments.slice(0, targetCount);
    }

    return comments;
  } catch (error) {
    console.error("获取评论失败:", error);
    throw error;
  } finally {
    // 写入文件
    writeFileSync(`${id}:comments.json`, JSON.stringify(comments, null, 2));
  }
};

// 示例：获取热门评论（默认就是热门排序 relevance）
fetchCommentsUntilCount().catch(console.error);

// 示例：获取按时间排序的评论
// fetchCommentsUntilCount("g4TDjwPRArg", 11000, "time").catch(console.error);
