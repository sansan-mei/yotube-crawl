/* eslint-disable @typescript-eslint/no-explicit-any */
declare type AnyArray = Array<any>;

declare type AnyObject = Record<string, any>;

declare namespace NodeJS {
  interface ProcessEnv {
    key: string;
    id: string;
  }
}

declare interface IComment {
  id: string;
  author: string;
  text: string;
  publishedAt: string;
  likeCount: number;
}

declare interface YouTubeCommentResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: Array<{
    kind: string;
    etag: string;
    id: string;
    snippet: {
      channelId: string;
      videoId: string;
      topLevelComment: {
        kind: string;
        etag: string;
        id: string;
        snippet: {
          channelId: string;
          videoId: string;
          textDisplay: string;
          textOriginal: string;
          authorDisplayName: string;
          authorProfileImageUrl: string;
          authorChannelUrl: string;
          authorChannelId: { value: string };
          canRate: boolean;
          viewerRating: string;
          likeCount: number;
          publishedAt: string;
          updatedAt: string;
        };
      };
      canReply: boolean;
      totalReplyCount: number;
      isPublic: boolean;
    };
    replies?: {
      comments: AnyArray;
    };
  }>;
}
