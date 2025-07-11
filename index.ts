import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, normalize } from "node:path";
import YTDlp from "yt-dlp-wrap";

const baseUrl = "https://youtube.googleapis.com/youtube/v3/commentThreads";
const videoBaseUrl = "https://youtube.googleapis.com/youtube/v3/videos";
const captionsUrl = "https://youtube.googleapis.com/youtube/v3/captions";
const apiKey = process.env.key;
const id = process.env.id;
const staticPath = process.env.static_path
  ? normalize(process.env.static_path)
  : process.cwd();

/**
 * 获取视频字幕列表（仅列表，不下载内容）
 * @param videoId YouTube视频ID
 * @returns 字幕列表
 */
const fetchCaptionsList = async (videoId: string = id): Promise<ICaption[]> => {
  try {
    const params = new URLSearchParams({
      part: "snippet",
      videoId: videoId,
      key: apiKey!,
    });

    const response = await fetch(`${captionsUrl}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`字幕API错误: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as YouTubeCaptionsResponse;

    const captions: ICaption[] = data.items.map((item) => ({
      id: item.id,
      language: item.snippet.language,
      name: item.snippet.name,
      trackKind: item.snippet.trackKind,
      isAutoGenerated: item.snippet.isAutoGenerated || false,
    }));

    console.log(`找到 ${captions.length} 个字幕轨道`);
    return captions;
  } catch (error) {
    console.error("获取字幕列表失败:", error);
    return [];
  }
};

/**
 * 使用yt-dlp下载字幕内容
 * @param videoId YouTube视频ID
 * @param outputPath 输出目录
 * @returns 字幕内容对象
 */
const downloadCaptionsWithYtDlp = async (
  videoId: string = id,
  outputPath: string,
): Promise<Record<string, string>> => {
  try {
    console.log("正在使用yt-dlp下载字幕内容...");
    const ytDlp = new YTDlp("./yt-dlp.exe");
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 下载字幕文件，添加反检测参数
    await ytDlp.execPromise([
      videoUrl,
      "--write-subs", // 下载手动字幕
      "--write-auto-subs", // 下载自动生成字幕
      "--sub-langs",
      "en,zh,zh-CN,zh-TW,ja,ko", // 多语言
      "--sub-format",
      "srt", // SRT格式
      "--skip-download", // 不下载视频
      "--cookies-from-browser",
      "chrome", // 使用Chrome浏览器的cookies
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "--sleep-interval",
      "1", // 请求间隔
      "--max-sleep-interval",
      "3", // 最大间隔
      "-o",
      `${outputPath}/${videoId}.%(ext)s`, // 输出文件名格式
    ]);

    // 读取下载的字幕文件
    const captionContents: Record<string, string> = {};

    try {
      const files = readdirSync(outputPath).filter(
        (file: string) => file.startsWith(videoId) && file.endsWith(".srt"),
      );

      for (const file of files) {
        const filePath = join(outputPath, file);
        const content = readFileSync(filePath, "utf-8");

        // 从文件名提取语言代码
        const langMatch = file.match(/\.([^.]+)\.srt$/);
        const lang = langMatch ? langMatch[1] : "unknown";

        captionContents[lang] = content;
        console.log(`已下载字幕: ${lang} (${file})`);
      }

      console.log(`共下载了 ${Object.keys(captionContents).length} 个字幕文件`);
    } catch (readError) {
      console.warn("读取字幕文件时出错:", readError);
    }

    return captionContents;
  } catch (error) {
    console.error(
      "yt-dlp下载字幕失败:",
      error instanceof Error ? error.message : String(error),
    );
    console.log("提示：请确保已安装yt-dlp或yt-dlp-wrap能正常工作");
    return {};
  }
};

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
 * 获取完整的视频数据（包括基础信息、评论、字幕列表和字幕内容）
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

    const currentPath = `${staticPath}/${videoId}youtube`;

    if (!existsSync(currentPath)) {
      mkdirSync(currentPath, { recursive: true });
    }

    // 获取视频基础信息
    const videoInfo = await fetchVideoInfo(videoId);

    // 获取评论
    const comments = await fetchCommentsUntilCount(videoId, targetCount, order);

    // 获取字幕列表（YouTube API）
    const captions = await fetchCaptionsList(videoId);

    // 使用yt-dlp下载字幕内容
    const captionContents = await downloadCaptionsWithYtDlp(
      videoId,
      currentPath,
    );

    // 保存视频基础信息到JSON文件
    const videoInfoPath = `${currentPath}/video_info.json`;
    writeFileSync(videoInfoPath, JSON.stringify(videoInfo, null, 2));
    console.log(`视频信息已保存到: ${videoInfoPath}`);

    // 保存评论到JSON文件
    const commentsPath = `${currentPath}/comments.json`;
    writeFileSync(commentsPath, JSON.stringify(comments, null, 2));
    console.log(`评论已保存到: ${commentsPath}`);

    // 保存字幕列表信息
    const captionsPath = `${currentPath}/captions_list.json`;
    writeFileSync(captionsPath, JSON.stringify(captions, null, 2));
    console.log(`字幕列表已保存到: ${captionsPath}`);

    // 保存字幕内容信息
    if (Object.keys(captionContents).length > 0) {
      const captionContentsPath = `${currentPath}/captions_content.json`;
      writeFileSync(
        captionContentsPath,
        JSON.stringify(captionContents, null, 2),
      );
      console.log(`字幕内容已保存到: ${captionContentsPath}`);
    }

    // 保存完整数据到一个文件
    const fullData = {
      videoInfo,
      comments,
      captions,
      captionContents,
      metadata: {
        crawledAt: new Date().toISOString(),
        totalComments: comments.length,
        totalCaptions: captions.length,
        totalCaptionContents: Object.keys(captionContents).length,
        captionSources: {
          list: "YouTube Data API v3",
          content: "yt-dlp",
        },
      },
    };

    const fullDataPath = `${currentPath}/full_data.json`;
    writeFileSync(fullDataPath, JSON.stringify(fullData, null, 2));

    console.log("视频数据获取完成！");
    console.log(`视频标题: ${videoInfo.title}`);
    console.log(`评论数量: ${comments.length}`);
    console.log(`字幕轨道数量: ${captions.length}`);
    console.log(`字幕内容数量: ${Object.keys(captionContents).length}`);
    console.log(`数据保存路径: ${currentPath}`);
  } catch (error) {
    console.error("获取视频数据失败:", error);
    throw error;
  }
};

// 执行主函数
(async () => {
  if (!id) {
    console.error("请设置环境变量 id (YouTube视频ID)");
    process.exit(1);
  }

  if (!apiKey) {
    console.error("请设置环境变量 key (YouTube API密钥)");
    process.exit(1);
  }

  try {
    await fetchVideoData(id);
  } catch (error) {
    console.error("程序执行失败:", error);
    process.exit(1);
  }
})();
