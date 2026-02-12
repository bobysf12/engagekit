export const THREADS_SELECTORS = {
  HOME_URL: "https://www.threads.com",

  NAVIGATION: {
    HOME: "a[href='/']",
    NOTIFICATIONS:
      'a[aria-label*="Notifications"], a[href="/notifications"], a[href*="notifications"]',
    PROFILE: 'a[href^="/@"], a[href^="/profile/"]',
    SEARCH:
      "input[role='searchbox'], input[type='search'], input[placeholder*='Search']",
  },

  AUTH: {
    LOGIN_BUTTON:
      "button[type='submit'], button:has-text('Log in'), button:has-text('Log in')",
    EMAIL_INPUT: "input[type='email'], input[name='email']",
    PASSWORD_INPUT: "input[type='password'], input[name='password']",
    LOGGED_IN_INDICATOR:
      'nav a[href="/@"], nav a[href*="profile"], div[role="navigation"]',
    LOGOUT_REQUIRED_INDICATOR:
      "button:has-text('Log in'), a:has-text('Log in')",
  },

  POSTS: {
    POST_ITEM: 'article, [data-testid="post"], [role="article"]',
    POST_TEXT: 'span[dir="auto"], [data-text="true"]',
    POST_AUTHOR: 'a[href^="/@"]:not([href*="/post/"])',
    POST_LINK: 'a[href*="/post/"]',
    POST_TIMESTAMP: "time, [data-time]",
    POST_MEDIA: "img, video",
    POST_ACTION_BAR: '[role="group"], [class*="actions"]',
    POST_LIKES: "span:has-text('like'), [class*='like-count']",
    POST_REPLIES: "span:has-text('reply'), [class*='reply-count']",
    POST_REPOSTS: "span:has-text('repost'), [class*='repost-count']",
    POST_VIEWS: "span:has-text('view'), [class*='view-count']",
  },

  COMMENTS: {
    COMMENT_CONTAINER: '[class*="comment"], [role="comment"]',
    COMMENT_TEXT: 'span[dir="auto"]',
    COMMENT_AUTHOR: '[data-username], [class*="username"]',
    COMMENT_AUTHOR_LINK: 'a[href^="/@"]',
    COMMENT_TIMESTAMP: "time",
    COMMENT_MEDIA: "img, video",
    LOAD_MORE_COMMENTS:
      "button:has-text('Show'), button:has-text('Load'), button:has-text('View')",
  },

  THREAD: {
    THREAD_ROOT: 'article:has-text("Thread"), [class*="thread"]',
    THREAD_EXPAND: "button:has-text('View'), button:has-text('Show')",
  },

  SEARCH: {
    RESULTS_CONTAINER: '[role="listbox"], [class*="search-results"]',
    RESULT_ITEM: '[role="option"], [class*="result-item"]',
  },

  LOADING: {
    SPINNER: '[role="progressbar"], [class*="loading"], [class*="spinner"]',
  },
};

export const THREADS_SELECTORS_FALLBACK = {
  NAVIGATION: {
    NOTIFICATIONS: 'a[href*="notif"]',
    PROFILE: 'a[href*="profile"], a[href="@"]',
  },
  POSTS: {
    POST_ITEM: 'div[class*="post"], div[class*="thread"]',
    POST_AUTHOR: 'a[href^="/@"]',
  },
  COMMENTS: {
    COMMENT_CONTAINER: 'div[class*="comment"]',
  },
};
