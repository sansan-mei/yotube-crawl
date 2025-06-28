import { mkdirSync, writeFileSync } from "node:fs";
import { normalize } from "node:path";

const baseUrl = "https://youtube.googleapis.com/youtube/v3/commentThreads";
const videoBaseUrl = "https://youtube.googleapis.com/youtube/v3/videos";
const apiKey = process.env.key;
const id = process.env.id;
const staticPath = process.env.static_path
  ? normalize(process.env.static_path)
  : process.cwd();

/**
 * 获取视频基础信息
 * @param videoId YouTube视频ID
 * @returns 视频基础信息对象
 */
const fetchVideoInfo = async (videoId: string = id): Promise<IVideoInfo> => {
  try {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      id: videoId,
      key: apiKey!,
    });

    const response = await fetch(`${videoBaseUrl}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API错误: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as YouTubeVideoResponse;

    if (!data.items || data.items.length === 0) {
      throw new Error("未找到视频信息");
    }

    const video = data.items[0];
    const videoInfo: IVideoInfo = {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount,
      categoryId: video.snippet.categoryId,
      tags: video.snippet.tags || [],
      thumbnails: video.snippet.thumbnails,
    };

    console.log(`已获取视频信息: ${videoInfo.title}`);
    console.log(
      `观看次数: ${videoInfo.viewCount}, 点赞数: ${videoInfo.likeCount}`,
    );

    return videoInfo;
  } catch (error) {
    console.error("获取视频信息失败:", error);
    throw error;
  }
};

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
  }
};

/**
 * 获取完整的视频数据（包括基础信息和评论）
 * @param videoId YouTube视频ID
 * @param targetCount 评论目标数量
 * @param order 评论排序方式
 */
const fetchVideoData = async (
  videoId: string = id,
  targetCount: number = 12000,
  order: "relevance" | "time" = "relevance",
) => {
  try {
    console.log("开始获取视频数据...");

    mkdirSync(`${staticPath}/${videoId}youtube`, { recursive: true });
    // 获取视频基础信息
    const videoInfo = await fetchVideoInfo(videoId);

    // 获取评论
    const comments = await fetchCommentsUntilCount(videoId, targetCount, order);

    // 创建目录并保存所有数据

    // 保存视频基础信息
    writeFileSync(
      `${staticPath}/${videoId}youtube/videoInfo.json`,
      JSON.stringify(videoInfo, null, 2),
    );

    // 保存评论数据
    writeFileSync(
      `${staticPath}/${videoId}youtube/comments.json`,
      JSON.stringify(comments, null, 2),
    );

    console.log("视频数据获取完成！");
    console.log(`视频标题: ${videoInfo.title}`);
    console.log(`评论数量: ${comments.length}`);

    return { videoInfo, comments };
  } catch (error) {
    console.error("获取视频数据失败:", error);
    throw error;
  }
};

// 获取完整视频数据（推荐使用）
fetchVideoData().catch(console.error);

// 单独获取视频基础信息
// fetchVideoInfo().then(info => console.log(info)).catch(console.error);

// 单独获取评论
// fetchCommentsUntilCount().catch(console.error);
