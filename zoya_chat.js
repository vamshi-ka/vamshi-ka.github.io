// Global scope variables
let userid = '318014';
let firstName = 'naveen';
let lastName = 'Guest';
let userEmailid = 'Guest@diy.in';
let sessionId = '';
let clientId = 'cbazaar';
let chkboxselect = 1;

// Initialize chat and handle WebSocket connection
$(document).ready(() => {
  disableChatInput();

  // Dynamic searchbar height adjustment
  $('.searchbar').on('input', function () {
    const newHeight = this.scrollHeight;
    $(this).css({
      height: Math.max(45, newHeight),
      overflow: newHeight >= 100 ? 'auto hidden' : 'hidden',
    });
  });
});

if (typeof $.easing.easeInOutCubic === 'undefined') {
  $.easing.easeInOutCubic = function (x, t, b, c, d) {
    if ((t /= d / 2) < 1) return (c / 2) * t * t * t + b;
    return (c / 2) * ((t -= 2) * t * t + 2) + b;
  };
}


const ScrollState = {
  isUserScrolling: false,
  lastScrollTop: 0,
  config: {
    threshold: 20,
    scrollDuration: 500,
    autoScrollThreshold: 74, // New threshold for auto-scrolling
  },
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function scrollToBottom(force = false) {
  const scrollableElements = [
    '.content_div',
    '.right-chat',
    '.ques_with_ans_main',
    '.ques_with_ans',
  ]
    .map(selector => document.querySelector(selector))
    .filter(Boolean);

  scrollableElements.forEach(element => {
    const currentScroll = element.scrollTop;
    const maxScroll = element.scrollHeight - element.clientHeight;
    const shouldAutoScroll =
      maxScroll - currentScroll <= ScrollState.config.autoScrollThreshold;

    if (force || shouldAutoScroll) {
      const startTime = performance.now();
      const duration = ScrollState.config.scrollDuration;

      function step(currentTime) {
        const elapsed = currentTime - startTime;
        if (elapsed >= duration) {
          element.scrollTop = maxScroll;
          return;
        }

        const progress = easeOutCubic(elapsed / duration);
        element.scrollTop =
          currentScroll + (maxScroll - currentScroll) * progress;
        requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    }
  });
}

function smoothStreamScroll() {
  scrollToBottom(true);
}

function getCurrentUrl() {
  return window.location.href;
}


// Global state management
let messageQueue = [];
let isProcessing = false;
let isAnimating = false;
let pastChatDisplayed = false;

// WebSocket configuration
const WS_CONFIG = {
  KEEPALIVE_INTERVAL: 15000,
  RECONNECT_ATTEMPTS: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
  BACKOFF_FACTOR: 1.5,
  URL: 'wss://65w42csz3g.execute-api.us-east-1.amazonaws.com/dev/?clientId=cbazaar',
  CONNECTION_TIMEOUT: 5000,
  MAX_RETRIES: 3,
};

class CookieHandler {
  constructor() {
    this.cookieName = '_zya';
    this.checkoutCookieName = '_zyacho';
    this.currentCookieName = this.cookieName;
  }

  handleCookieSession() {
    // Set cookie name based on page
    if (window.location.href.indexOf('/checkout/') > -1) {
      this.currentCookieName = this.checkoutCookieName;
    }

    // Determine user credentials with multiple fallbacks
    let determinedUserId = '';
    let determinedUserEmail = '';
    let determinedFirstName = '';

    if (
      typeof gUserId !== 'undefined' &&
      gUserId !== '0' &&
      !isNaN(gUserId) &&
      gUserId !== ''
    ) {
      determinedUserId = gUserId;
      determinedUserEmail = gUserLoginId || '';
      determinedFirstName = gUserName || '';
    } else if (this.getCookie('_GoogleClient') !== '') {
      determinedUserId = this.getCookie('_GoogleClient');
      determinedUserEmail = `${determinedUserId}@zya.com`;
      determinedFirstName = determinedUserId;
    } else if (typeof gStrSessionID !== 'undefined' && gStrSessionID !== '') {
      determinedUserId = gStrSessionID;
      determinedUserEmail = `${determinedUserId}@zya.com`;
      determinedFirstName = determinedUserId;
    }

    // Update global variables
    userid = determinedUserId || userid || '0';
    userEmailid = determinedUserEmail || `${userid}@zya.com`;
    firstName = determinedFirstName || 'Guest';

    const existingCookie = this.getCookie(this.currentCookieName);

    if (existingCookie) {
      const [cookieUserId, cookieSessionId] = existingCookie.split('_');

      if (cookieUserId && cookieSessionId) {
        sessionId = cookieSessionId;
        this.refreshCookie(existingCookie);
        handlePastChat(sessionId);
        return;
      }
    }

    this.initializeNewChat();
  }

  createCookie(name, value, days = 20) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `; expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value}${expires}; path=/`;
  }

  getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return '';
  }

  refreshCookie(value) {
    this.deleteCookie(this.currentCookieName);
    this.createCookie(this.currentCookieName, value);
  }

  deleteCookie(name) {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
  }

  initializeNewChat() {
    if (!this.hasInitializedChat) {
      const chatData = {
        action: 'zoyaNewChat',
        userId: userid,
        firstName,
        lastName,
        email: userEmailid,
        clientId,
        currentPage: getCurrentUrl(),
      };

      wsHandler.send(chatData);
      console.log('New chat request sent successfully');

      this.hasInitializedChat = true;
    } else {
      console.log('Chat already initialized, skipping new chat request');
    }
  }
}

class WebSocketHandler {
  constructor() {
    // Core WebSocket properties
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isProcessingMessage = false;

    // Connection management
    this.connectionConfig = {
      keepAliveInterval: WS_CONFIG.KEEPALIVE_INTERVAL,
      connectionTimeout: WS_CONFIG.CONNECTION_TIMEOUT,
      maxReconnectAttempts: 5,
      baseDelay: 1000,
      maxDelay: 16000,
    };
    this.reconnectAttempts = 0;
    this.hasShownError = false;
    this.isRetrying = false;
    this.hasInitializedChat = false;

    this.lastZoyaNewChatTime = 0;
    this.zoyaNewChatCooldown = 5000;
    this.pendingZoyaNewChat = null;
    this.zoyaNewChatTimeout = null;

    // Tracking data
    this.sendTrackingData = () => {
      if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) return;

      const currentState = EnhancedTracker.getState();
      const trackingData = {
        action: 'trackInteraction',
        data: {
          timestamp: new Date().toISOString(),
          scroll: {
            position: window.scrollY,
            percentage: (
              (window.scrollY /
                (document.documentElement.scrollHeight - window.innerHeight)) *
              100
            ).toFixed(1),
            direction: currentState.scroll.direction,
            totalDistance: Math.round(currentState.scroll.totalDistance),
          },
          mouse: {
            position: currentState.mouse.position,
            exitAttempts: currentState.mouse.exitAttempts,
            isNearExit: currentState.mouse.isNearExit,
          },
          session: {
            duration: (
              (Date.now() - currentState.session.startTime) /
              1000
            ).toFixed(1),
            tabSwitches: currentState.session.tabSwitches,
            isActive: currentState.session.isActive,
          },
          elements: {
            totalInteractions: currentState.elements.totalInteractions,
            lastInteraction: currentState.elements.lastInteraction,
            trackedElements: Array.from(
              currentState.elements.tracked.values()
            ).map(data => ({
              id: data.id,
              clicks: data.clicks,
              hovers: data.hovers,
              timeSpent: data.timeSpent,
            })),
          },
          inputs: {
            totalKeystrokes: currentState.inputs.totalKeystrokes,
            typingSpeed: Math.round(currentState.inputs.typingSpeed),
            trackedInputs: Array.from(
              currentState.inputs.trackedInputs.values()
            ).map(data => ({
              id: data.id,
              keystrokes: data.keystrokes,
              length: data.currentText.length,
            })),
          },
          tab: {
            id: currentState.tab.id,
            position: currentState.tab.position,
            total: currentState.tab.total,
          },
        },
      };

      try {
        this.ws.send(JSON.stringify(trackingData));
      } catch (error) {
        console.error('Failed to send tracking data:', error);
      }
    };

    // Timer management
    this.keepAliveTimer = null;
    this.connectionTimer = null;
    this.reconnectTimer = null;

    // Message management
    this.pendingMessages = [];
    this.lastMessage = null;
    this.messageHistory = [];

    // Deduplication sets
    this.processedMessages = new Set();
    this.processedRegistrations = new Set();
    this.processedChats = new Set();
    this.processedProducts = new Set();
    this.processedLoadingMessages = new Set();
    this.processedButtonMessages = new Set();

    this.cookieHandler = new CookieHandler();

    this.initializeCookieConfig();

    this.initialize();
  }

  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.pageLoadDebounceTimer) {
      clearTimeout(this.pageLoadDebounceTimer);
    }
    this.sentPageLoads.clear();
    this.sentPageLoadsTimestamp.clear();
  }

  initialize() {
    this.connect();
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  initializeCookieConfig() {
    // Update cookie name if on checkout page
    if (window.location.href.indexOf('/checkout/') > -1) {
      this.cookieName = this.checkoutCookieName;
    }
  }

  async connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log(
        this.isConnecting
          ? 'Connection attempt in progress'
          : 'WebSocket already connected'
      );
      return;
    }

    this.isConnecting = true;

    try {
      await this.cleanup();

      return new Promise((resolve, reject) => {
        console.log(
          `Attempting connection (${this.reconnectAttempts + 1}/${
            this.connectionConfig.maxReconnectAttempts
          })`
        );

        this.ws = new WebSocket(WS_CONFIG.URL);

        // More comprehensive error logging
        this.ws.onerror = error => {
          console.error('WebSocket Connection Error:', {
            error,
            readyState: this.ws.readyState,
            url: this.ws.url,
          });
          this.handleConnectionFailure();
          reject(error);
        };

        // Set connection timeout with more detailed logging
        this.connectionTimer = setTimeout(() => {
          if (this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket Connection Timeout', {
              readyState: this.ws.readyState,
              currentAttempt: this.reconnectAttempts,
            });
            this.ws.close();
            this.handleConnectionFailure();
            reject(new Error('Connection timeout'));
          }
        }, this.connectionConfig.connectionTimeout);

        this.ws.onopen = () => {
          console.log('WebSocket Connection Successful', {
            readyState: this.ws.readyState,
          });
          clearTimeout(this.connectionTimer);
          this.handleSuccessfulConnection();
          this.setupEventHandlers();
          resolve(true);
        };

        this.ws.onclose = event => {
          console.error('WebSocket Closed', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          clearTimeout(this.connectionTimer);
          this.handleConnectionClosure();
        };
      });
    } catch (error) {
      console.error('WebSocket Connection Attempt Failed:', error);
      this.handleConnectionFailure();
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onmessage = async event => {
      let data;
      try {
        data = JSON.parse(event.data);

        // Add this check for API error
        if (
          data.error &&
          typeof data.error === 'string' &&
          (data.error.includes('credit balance is too low') ||
            data.error.includes('Internal server error'))
        ) {
          handleInternalServerError(data.error);
          return;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        handleInternalServerError(error);
        return;
      }

      try {
        await this.handleMessage(data);
      } catch (error) {
        console.error(`Error handling action ${data.currentAction}:`, error);
        handleInternalServerError(error);
      }
    };
  }

  async handleMessage(data) {
    if (!data) {
      console.log(new Error('Invalid message received'));
      return;
    }

    try {

      if (data === 'pong') {
        return;
      }

      if (data.error) {
        console.log(data.error);
        return;
      }

      if (
        data.currentAction === 'sendMessage_streamingMessage' &&
        data.subAction === 'pageLoad'
      ) {
        if (!pastChatDisplayed) {
          console.log(
            'Waiting for past chat to complete before showing page load response'
          );
          return;
        }
      }

      if (!data.currentAction) {
        console.log(new Error('No action specified in message'));
        return;
      }

      if (data.currentAction === 'zoyaNewChat') {
        const key = `chat-${data.sessionId}`;

        // More robust duplicate check
        if (this.processedChats.has(key)) {
          return;
        }

        // Ensure session information is set before processing
        if (data.sessionId) {
          // Update global session variables
          sessionId = data.sessionId;
          userid = data.userId || userid;
          userEmailid = data.email || userEmailid;

          // Use cookieHandler for consistent cookie management
          this.cookieHandler.deleteCookie(this.cookieHandler.currentCookieName);
          this.cookieHandler.createCookie(
            this.cookieHandler.currentCookieName,
            `${userid}_${sessionId}`
          );

          // Mark chat as initialized
          this.hasInitializedChat = true;
          this.processedChats.add(key);

          // If page tracker exists, it will now handle page load events
          // based on the new session ID
          if (window.pageTracker) {
            // The page tracker will now only queue and send if sessionId is valid
            window.pageTracker.queuePageLoadEvent(true, null, {
              suppressTypingAnimation: true,
              isNewChat: true,
            });
          }

          // Ensure ZoyaNewChat is handled
          try {
            await handleZoyaNewChat(data);
          } catch (error) {
            console.error('Error in handleZoyaNewChat:', error);
          }
        } else {
          console.warn('New chat message received without sessionId');
        }
      }

      // Remove reconnection message if present
      $('.ans_text:contains("Reconnecting to service")')
        .closest('.answers_div')
        .fadeOut(300, function () {
          $(this).remove();
        });

      // Handle internal server errors
      if (data.message === 'Internal server error') {
        handleInternalServerError();
        return;
      }

      const handlers = {
        zoyaNewChat: async () => {
          const key = `chat-${data.sessionId}`;
          if (this.processedChats.has(key)) {
            return;
          }
          this.processedChats.add(key);

          // Handle cookie management for new chat
          if (data.sessionId) {
            sessionId = data.sessionId;
            userid = data.userId || userid;

            // Use cookieHandler methods
            this.cookieHandler.deleteCookie(
              this.cookieHandler.currentCookieName
            );
            this.cookieHandler.createCookie(
              this.cookieHandler.currentCookieName,
              `${userid}_${sessionId}`
            );
          }

          await handleZoyaNewChat(data);
        },
        sendMessage_streamingMessage: async () => {
          const key = `stream-${data.messageId}-${data.message}`;
          if (this.processedMessages.has(key)) {
            console.warn('Duplicate streaming message detected', key);
            return;
          }
          this.processedMessages.add(key);
          await handleStreamingMessage(data);
        },
        sendMessage_loading: async () => {
          const key = `loading-${data.messageId}`;
          if (this.processedLoadingMessages.has(key)) {
            console.warn('Duplicate loading message detected', key);
            return;
          }
          this.processedLoadingMessages.add(key);
          await handleSendMessageLoading(data);
        },
        sendMessage_products: async () => {
          const key = `products-${data.messageId}`;
          if (this.processedProducts.has(key)) {
            console.warn('Duplicate product message detected', key);
            return;
          }
          this.processedProducts.add(key);
          await handleSendMessageProducts(data);
        },
        sendMessage_buttons: async () => {
          const key = `buttons-${data.messageId}-${data.message.join('-')}`;
          if (this.processedButtonMessages.has(key)) {
            console.warn('Duplicate button message detected', key);
            return;
          }
          this.processedButtonMessages.add(key);
          await handleSendMessageButtons(data);
        },
        sendMessage_streamEnd: () => {
          this.isProcessingMessage = false;
          handleStreamEnd();
        },
      };

      const handler = handlers[data.currentAction];
      if (handler) {
        await handler();
      } else {
        console.warn('Unknown action:', data.currentAction);
      }
    } catch (error) {
      console.log(error);
    }
  }

  handleCookieSession() {
    this.cookieHandler.handleCookieSession();
  }

  initializeNewChat() {
    this.cookieHandler.initializeNewChat();
  }

  handleSuccessfulConnection() {
    console.log('WebSocket connected successfully');
    this.isConnecting = false;
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.hasShownError = false;
    this.startKeepAlive();

    // Remove connection error messages
    $('.connection-status-message, .reconnecting-message').fadeOut(
      300,
      function () {
        $(this).remove();
      }
    );

    // Also specifically target and remove the reconnection message
    $('.ans_text:contains("Reconnecting to service")')
      .closest('.answers_div')
      .fadeOut(300, function () {
        $(this).remove();
      });

    // Don't reset chat interface on reconnection
    if (this.hasInitializedChat) {
      $('.default_screen').hide();
      $('.listing_div').show();
    }

    // Enable input if no message is being processed
    if (!this.isProcessingMessage) {
      enableChatInput();
    }

    // Handle cookie and session initialization
    if (!this.hasInitializedChat) {
      this.cookieHandler.handleCookieSession();
    }

    // Process any pending messages
    this.processPendingMessages();
  }

  handleConnectionFailure() {
    this.isConnecting = false;
    this.isConnected = false;
    this.stopKeepAlive();

    if (this.reconnectAttempts < this.connectionConfig.maxReconnectAttempts) {
      const delay = Math.min(
        this.connectionConfig.baseDelay * Math.pow(2, this.reconnectAttempts),
        this.connectionConfig.maxDelay
      );

      console.log(
        `reconnection attempt ${this.reconnectAttempts + 1}/${
          this.connectionConfig.maxReconnectAttempts
        }`
      );

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else if (!this.hasShownError) {
      // Show connection status without resetting chat
      this.showConnectionStatus();
    }
  }

  handleConnectionClosure() {
    if (this.isConnected) {
      this.isConnected = false;
      this.handleConnectionFailure();
    }
  }

  showConnectionStatus() {
    this.hasShownError = true;

    // Remove any existing connection status or loading messages
    $('.connection-status-message').remove();
    $('.loading-message').remove();
    $('.darban-initial-loader').remove();

    // Hide initializing chat div and other loading states
    $('#container-loader').hide();
    $('.default_screen').hide();
    $('.ai-search-chat').show();

    // Add connection status message
    const statusHtml = `
        <div class="answers_div loading-message">
            <div class="ans_text">
                <span class="pr-2">
                    <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
                </span>
                <div class="loading-content d-flex align-items-center gap-2">
                    <span class="loading-text font-italic">
                        Reconnecting to service
                    </span>
                    <div class="typing-indicator d-inline-flex align-items-center ms-1">
                        <span class="jump1"></span>
                        <span class="jump2"></span>
                        <span class="jump3"></span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append status message with animation
    const $status = $(statusHtml).appendTo('.ques_with_ans');

    // Animate the status message entrance
    requestAnimationFrame(() => {
      $status.css({
        transition: 'all 0.3s ease-out',
        opacity: '1',
        transform: 'translateY(0)',
      });
    });
  }

  async send(message) {
    // Check if this is a zoyaNewChat request
    if (message.action === 'zoyaNewChat') {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastZoyaNewChatTime;

      // If within cooldown period
      if (timeSinceLastRequest < this.zoyaNewChatCooldown) {
        // Don't schedule new messages if we already sent one recently
        if (this.lastZoyaNewChatTime > 0) {
          return;
        }

        // Only schedule if this is the first attempt
        if (!this.zoyaNewChatTimeout) {
          console.log(
            'Rate limiting zoyaNewChat request - scheduling one delayed request'
          );

          // Store the message
          this.pendingZoyaNewChat = message;

          // Schedule single delayed send
          this.zoyaNewChatTimeout = setTimeout(() => {
            if (this.pendingZoyaNewChat) {
              console.log('Sending single delayed zoyaNewChat request');
              this.lastZoyaNewChatTime = Date.now();
              this.send(this.pendingZoyaNewChat);

              // Clear state
              this.pendingZoyaNewChat = null;
              this.zoyaNewChatTimeout = null;
            }
          }, this.zoyaNewChatCooldown - timeSinceLastRequest);

          return;
        }

        // Skip if we already have a pending request
        console.log(
          'Rate limiting zoyaNewChat request - already have pending request'
        );
        return;
      }

      // Update last request time
      this.lastZoyaNewChatTime = now;
    }

    // Continue with normal send logic...
    this.preserveMessage(message);

    if (!navigator.onLine || this.ws?.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      await this.connect();
      return;
    }

    try {
      this.isProcessingMessage = true;
      disableChatInput();
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      this.pendingMessages.push(message);
      await this.connect();
    }
  }

  clearRateLimitingState() {
    if (this.zoyaNewChatTimeout) {
      clearTimeout(this.zoyaNewChatTimeout);
      this.zoyaNewChatTimeout = null;
    }
    this.pendingZoyaNewChat = null;
    this.lastZoyaNewChatTime = 0;
  }

  preserveMessage(message) {
    this.messageHistory.push(message);
    this.lastMessage = message;
  }

  async processPendingMessages() {
    if (this.pendingMessages.length === 0 || !this.isConnected) return;

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const message of messages) {
      try {
        await this.send(message);
      } catch (error) {
        console.error('Error processing pending message:', error);
        this.pendingMessages.unshift(message);
        break;
      }
    }
  }

  handleOnline() {
    console.log('Network connection restored');
    if (!this.isConnected) {
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  handleOffline() {
    console.log('Network connection lost');
    this.isConnected = false;
    this.stopKeepAlive();
  }

  startKeepAlive() {
    // Clear any existing timer first
    this.stopKeepAlive();

    // Create recursive keepalive function
    const keepAlive = () => {
      // Only send keepalive if connection is open
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          // Send ping message with correct action
          this.ws.send(
            JSON.stringify({
              action: 'ping',
            })
          );

          // Schedule next keepalive
          this.keepAliveTimer = setTimeout(
            keepAlive,
            this.connectionConfig.keepAliveInterval
          );
        } catch (error) {
          console.warn('Failed to send keepalive:', error);
          this.stopKeepAlive();
          // Attempt to reconnect on failure
          this.connect();
        }
      } else {
        // Stop keepalive if connection is closed
        this.stopKeepAlive();
      }
    };

    // Start the keepalive cycle
    keepAlive();
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  async cleanup() {
    this.clearRateLimitingState();

    // Existing cleanup code...
    this.stopKeepAlive();

    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        if (this.ws.readyState !== WebSocket.CLOSED) {
          this.ws.onclose = null;
          this.ws.close(1000, 'Intentional closure for new chat');
        }
      } catch (error) {
        console.warn('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
  }

  resetState() {
    this.processedMessages.clear();
    this.processedRegistrations.clear();
    this.processedChats.clear();
    this.processedProducts.clear();
    this.processedLoadingMessages.clear();
    this.processedButtonMessages.clear();

    // Reset message-related states
    MessageState.isStreaming = false;
    MessageState.pendingButtons = null;
    MessageState.currentMessageId = null;

    // Reset tracking flags
    this.hasInitializedChat = false;
    this.isProcessingMessage = false;
  }

  isConnectionActive() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Initialize the WebSocket handler
const wsHandler = new WebSocketHandler();

// Make the handler globally available
window.webSocket = wsHandler.ws;

function handleOfflineMessageTransition($loadingElement) {

  if (wsHandler.isConnected) {
    $loadingElement.fadeOut(300, function () {
      $(this).remove();
    });
    return;
  }

  $loadingElement.css({
    transition: 'opacity 0.3s ease-out',
    opacity: '0',
  });

  setTimeout(() => {
    $loadingElement.remove();

    const retryText =
      wsHandler.reconnectAttempts >= WS_CONFIG.RECONNECT_ATTEMPTS
        ? "We couldn't establish a connection after several attempts. Please try again."
        : 'Please check your connection and try again';

    const offlineMessageHtml = `
            <div class="answers_div offline-transition" style="opacity: 0; transform: translateY(20px);">
                <div class="ans_text">
                    <span class="pr-2">
                        <img width="27" src="/Images/zoya_chat_icon.png"  alt="zoya_chat_icon"/>
                    </span>
                    <div class="offline-content">
                        <div class="offline-message-box">
                            <div class="offline-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
                                </svg>
                            </div>
                            <div class="offline-text">
                                <h4>No Internet Connection</h4>
                                <p>${retryText}</p>
                            </div>
                            <button class="retry-button" onclick="retryLastMessage()">
                                ${
                                  wsHandler.reconnectAttempts >=
                                  WS_CONFIG.RECONNECT_ATTEMPTS
                                    ? 'Try Again'
                                    : 'Retry'
                                }
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    const $offlineMessage = $(offlineMessageHtml).appendTo('.ques_with_ans');

    setTimeout(() => {
      $offlineMessage.css({
        opacity: '1',
        transform: 'translateY(0)',
      });
    }, 50);

    $('#chat-input')
      .prop('disabled', false)
      .attr('placeholder', 'Your questions go here...');
  }, 300);
}

// Enhanced retry logic
async function retryLastMessage() {
  if (!lastAttemptedMessage) {
    console.error('No message to retry');
    return;
  }

  const $retryButton = $('.retry-button');
  const $offlineMessage = $('.offline-transition');

  // Disable retry button and update text
  $retryButton.prop('disabled', true).text('Retrying...');

  try {
    // Remove offline message with animation
    await new Promise(resolve => {
      $offlineMessage.css({
        opacity: '0',
        transform: 'translateY(20px)',
      });
      setTimeout(resolve, 300);
    });

    $offlineMessage.remove();

    // Show loading animation
    const loadingHtml = `
      <div class="answers_div loading-message" style="opacity: 0; transform: translateY(20px);">
        <div class="ans_text">
          <span class="pr-2">
            <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
          </span>
          <div class="typing-indicator">
            <span class="jump1"></span>
            <span class="jump2"></span>
            <span class="jump3"></span>
          </div>
        </div>
      </div>
    `;

    const $loading = $(loadingHtml).appendTo('.ques_with_ans');

    // Animate loading indicator
    requestAnimationFrame(() => {
      $loading.css({
        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
        opacity: '1',
        transform: 'translateY(0)',
      });
    });

    // Check internet connection first
    try {
      await checkInternetConnection();
    } catch (error) {
      throw new Error('Still offline');
    }

    // Set retry flag
    wsHandler.isRetrying = true;

    // Reset WebSocket connection
    wsHandler.reconnectAttempts = 0;
    wsHandler.isReconnecting = false;

    // Close existing connection if any
    if (wsHandler.ws) {
      await wsHandler.cleanup();
    }

    // Establish new connection
    await wsHandler.connect();

    // Wait for connection to be fully established
    await new Promise((resolve, reject) => {
      const checkConnection = setInterval(() => {
        if (
          wsHandler.isConnected &&
          wsHandler.ws?.readyState === WebSocket.OPEN
        ) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 100);

      // Add timeout for connection check
      setTimeout(() => {
        clearInterval(checkConnection);
        reject(new Error('Connection timeout'));
      }, 5000);
    });

    // Once connected, send the latest attempted message
    if (wsHandler.isConnected && wsHandler.ws?.readyState === WebSocket.OPEN) {
      wsHandler.send(lastAttemptedMessage);
      smoothStreamScroll();
    } else {
      throw new Error('Connection not established');
    }
  } catch (error) {
    console.error('Retry failed:', error);
    const $loading = $('.loading-message');
    if ($loading.length) {
      handleOfflineMessageTransition($loading);
    }
  } finally {
    // Reset retry flag
    wsHandler.isRetrying = false;
  }
}

async function checkConnectionAndSend(msg, $loading) {
  try {
    await checkInternetConnection();
    wsHandler.send(msg);
  } catch (error) {
    console.error('Connection attempt failed:', error);
    handleOfflineMessageTransition($loading);
  }
}

// Add easing function once if not exists
$.easing.easeOutCubic ??= (_, t, b, c, d) =>
  c * ((t = t / d - 1) * t * t + 1) + b;

let lastAttemptedMessage = null;

function sendMessageOnSearch(
  userMessage,
  buttonReply = '',
) {
  if (!userMessage || userMessage.trim() === '') {
    console.log('User message is empty, returning');
    return;
  }

  // Store message for retry functionality
  const msg = {
    action: 'sendMessageTest',
    userMessage: userMessage,
    buttonReply: buttonReply,
    sessionId: sessionId,
    userId: userid,
    clientId: clientId,
    currentPage: getCurrentUrl(),
    productCode: '',
  };
  lastAttemptedMessage = msg;

  $('.button-animation-container').remove(); // Remove button container when sending message
  $('.default-que.two.card_div.msgbuttons').remove(); // Remove existing buttons
  smoothStreamScroll();

  $('.sensitive_info_text').css({ display: 'none' });
  $('.default_screen').css({ display: 'none' });
  $('.listing_div').css({ display: 'block' });

  // Add user message with animation
  const $userMessage = $(
    '<div class="questions_div" style="opacity: 0; transform: translateY(20px);"><p>' +
      userMessage +
      '</p></div>'
  ).appendTo('.ques_with_ans');

  // Animate user message
  requestAnimationFrame(() => {
    $userMessage.css({
      transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
      opacity: '1',
      transform: 'translateY(0)',
    });
  });

  // Add loading animation with avatar
  const loadingHtml = `
    <div class="answers_div loading-message" style="opacity: 0; transform: translateY(20px);">
      <div class="ans_text">
        <span class="pr-2">
          <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
        </span>
        <div class="typing-indicator">
          <span class="jump1"></span>
          <span class="jump2"></span>
          <span class="jump3"></span>
        </div>
      </div>
    </div>
  `;
  const $loading = $(loadingHtml).appendTo('.ques_with_ans');

  // Animate loading indicator
  requestAnimationFrame(() => {
    $loading.css({
      transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
      opacity: '1',
      transform: 'translateY(0)',
    });
  });

  smoothStreamScroll();
  disableChatInput();

  // Check connection and send
  checkConnectionAndSend(msg, $loading);

  $('#chat-input').val('');
}
// Helper functions
async function checkInternetConnection() {
  if (!navigator.onLine) {
    throw new Error('No internet connection');
  }

  try {
    await fetch('https://www.google.com/favicon.ico', {
      mode: 'no-cors',
      cache: 'no-store',
      timeout: 5000,
    });
    return true;
  } catch (error) {
    throw new Error('No internet connection');
  }
}

// Add these helper functions
function createLoadingAnimation() {
  return $(`
        <div class="answers_div response-loading" style="opacity: 0; transform: translateY(20px);">
            <div class="ans_text">
                <span class="pr-2">
                    <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
                </span>
                <div class="typing-indicator">
                    <span class="jump1"></span>
                    <span class="jump2"></span>
                    <span class="jump3"></span>
                </div>
            </div>
        </div>
    `);
}

const animate = ($el, props, duration = 300) =>
  new Promise(resolve =>
    requestAnimationFrame(() => {
      $el.css({ transition: `all ${duration}ms ease-out`, ...props });
      setTimeout(resolve, duration);
    })
  );

const showLoading = async () => {
  disableChatInput();
  const $loading = createLoadingAnimation().appendTo('.ques_with_ans');
  await animate($loading, { opacity: 1, transform: 'translateY(0)' });
  return $loading;
};

const hideLoading = async $loading => {
  await animate($loading, { opacity: 0, transform: 'translateY(10px)' });
  $loading.remove();
  enableChatInput();
};

function disableChatInput() {
  // Disable and update placeholder for input
  $('#chat-input')
    .attr('placeholder', 'Just a moment, it will be completed shortly...')
    .prop('disabled', true);

  // Style the send button to look disabled
  $('#send-button').prop('disabled', true).css({
    'background-color': '#e0e0e0',
    cursor: 'not-allowed',
    opacity: '0.5',
    filter: 'grayscale(100%)',
    'pointer-events': 'none',
    transition: 'all 0.3s ease',
  });
}

// Function to enable chat input after loading
function enableChatInput() {
  return new Promise(resolve => {
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');

    if (!chatInput || !sendButton) {
      resolve();
      return;
    }

    // Force remove any lingering disabled states
    chatInput.disabled = false;
    chatInput.setAttribute('placeholder', 'Your questions go here...');
    chatInput.style.pointerEvents = 'auto';
    chatInput.style.opacity = '1';

    sendButton.disabled = false;
    sendButton.style.backgroundColor = '';
    sendButton.style.cursor = 'pointer';
    sendButton.style.opacity = '1';
    sendButton.style.filter = 'none';
    sendButton.style.pointerEvents = 'auto';

    // Double check after a short delay
    setTimeout(() => {
      if (chatInput.disabled) {
        chatInput.disabled = false;
      }
      resolve();
    }, 100);
  });
}

function resetMessageState() {
  wsHandler.isProcessingMessage = false;
  MessageState.isStreaming = false;
  MessageState.pendingButtons = null;
  MessageState.currentMessageId = null;
  enableChatInput();
}

/** Safely sends WebSocket messages with state checking */
const sendWebSocketMessage = msg => {
  wsHandler.send(msg);
};

/**Handles new user registration*/

function handleZoyaNewChat(data) {
  // Only process if new session or forced new chat
  if (!sessionId || data.forceNewSession) {
    wsHandler.resetState();
    sessionId = data.sessionId;
    userid = data.userId;
    userEmailid = data.email || 'guest@example.com';

    // Clear existing messages and typing indicators
    $(
      '.answers_div, .questions_div, .msgbuttons, .typing-indicator-message'
    ).remove();

    // Show main containers
    $('.default_screen, .listing_div').css({
      display: 'block',
      opacity: '1',
    });

    $('.header-chat .newChat').css('display', 'block');
    disableChatInput();

    // Only add typing indicator if default screen is hidden
    if ($('.default_screen').is(':hidden')) {
      const typingHtml = `
        <div class="answers_div typing-indicator-message">
          <div class="ans_text">
            <span class="pr-2">
              <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
            </span>
            <div class="typing-indicator">
              <span class="jump1"></span>
              <span class="jump2"></span>
              <span class="jump3"></span>
            </div>
          </div>
        </div>
      `;

      $('.ques_with_ans').append(typingHtml);
    }

    setTimeout(() => {
      enableChatInput();
      $('#search-input').focus();
    }, 500);

    wsHandler.hasInitializedChat = true;

    console.log('New Chat Session Established:', {
      sessionId: data.sessionId,
      userId: data.userId,
      type: data.type,
    });
  }
}

/** Handles product pinning Product data */
const pinProduct = async data => {
  const msg = {
    action: 'pinProduct',
    userId: data.userId,
    clientId: clientId,
    sessionId: sessionId,
    product: $('.prod_code').html(),
    currentPage: getCurrentUrl(),
  };
  sendWebSocketMessage(msg);
};

/** Handles past chat messages and display */
async function handlePastChat(sessionId) {

  pastChatDisplayed = false; 
  console.log('Past chat loading started');

  try {
    // Clear existing messages
    $('.answers_div').remove();
    $('.questions_div').remove();
    $('.sensitive_info_main').css('display', 'none');
    $('.default_screen').css({ display: 'none' });
    $('.listing_div').css({ display: 'block' });
    $('.msgbuttons').remove();

    // Add loading indicator
    const loadingHtml = `
      <div class="answers_div typing-indicator-message">
        <div class="ans_text">
          <span class="pr-2">
            <img width="27" src="/Images/zoya_chat_icon.png"  alt="zoya_chat_icon"/>
          </span>
          <div class="typing-indicator">
            <span class="jump1"></span>
            <span class="jump2"></span>
            <span class="jump3"></span>
          </div>
        </div>
      </div>
    `;
    const $loadingIndicator = $(loadingHtml).appendTo('.ques_with_ans');

    // Update API endpoint
    const API_BASE_URL = 'https://q2rrgmis95.execute-api.us-east-1.amazonaws.com/dev';
    const API_ENDPOINT = `${API_BASE_URL}/pastChat`;

    // Add API version and additional params
    const params = new URLSearchParams({
      sessionId: sessionId,
      clientId: clientId,
      version: 'v2', // Add API version if needed
    });

    // Improved error handling
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000;

    async function fetchPastChat() {
      try {
        console.log('Fetching past chat for sessionId:', sessionId);

        // Add headers and timeout
        const response = await fetch(`${API_ENDPOINT}?${params}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        });

        // Log response status for debugging
        console.log('API Response status:', response.status);

        // Handle different response statuses
        if (response.status === 404) {
          console.log('Session not found, initializing new chat');

          // Clear cookies
          wsHandler.cookieHandler.deleteCookie(
            wsHandler.cookieHandler.currentCookieName
          );
          wsHandler.cookieHandler.deleteCookie(
            wsHandler.cookieHandler.checkoutCookieName
          );

          $loadingIndicator.remove();

          // Initialize new chat
          wsHandler.send({
            action: 'zoyaNewChat',
            userId: userid,
            firstName: firstName,
            lastName: lastName,
            email: userEmailid,
            clientId: clientId,
            currentPage: getCurrentUrl(),
          });

          return null;
        }

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching past chat:', error);

        // Implement exponential backoff
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          console.log(
            `Retrying in ${delay}ms... (Attempt ${retryCount} of ${maxRetries})`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          return await fetchPastChat();
        }
        throw error;
      }
    }

    const responseData = await fetchPastChat();

    // If null returned, new chat was initiated
    if (responseData === null) return;

    // Remove loading indicator
    $loadingIndicator.remove();

    // Handle both possible data structures
    const messages =
      responseData.customerMemory || responseData.messages || responseData;

    if (!Array.isArray(messages)) {
      throw new Error('Invalid data structure received from API');
    }

    // Find the last message with buttons
    let lastValidButtonMessage = null;
    let lastAssistantMessageIndex = -1;

    // First find the last assistant message's index
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistantMessageIndex = i;
        break;
      }
    }

    // Then check if this last assistant message has buttons
    if (
      lastAssistantMessageIndex !== -1 &&
      messages[lastAssistantMessageIndex].content.buttons?.length
    ) {
      lastValidButtonMessage = messages[lastAssistantMessageIndex];
    }

    const shouldShowAvatar = () => {
      // Always show avatar for first message
      if ($('.ques_with_ans > div').length === 0) return true;

      const $lastElement = $('.ques_with_ans > div').last();

      // Show avatar if previous element was:
      return (
        $lastElement.hasClass('questions_div') || // User message
        $lastElement.hasClass('loading-message') || // Loading indicator
        $lastElement.find('.msgbuttons').length > 0 || // Button container
        $lastElement.find('.product-swiper-container').length > 0 || // Product display
        $lastElement.find('.swiper').length > 0 || // Swiper container
        $lastElement.find('.ans_pro_main').length > 0 || // Product main container
        !$lastElement.hasClass('answers_div') || // Not an answer div
        $lastElement.hasClass('product-swiper-container') || // Product container
        $lastElement.hasClass('swiper') // Swiper element
      );
    };

    // Process each message in chronological order
    for (const message of messages) {
      if (!message.content || !message.role) {
        console.warn('Skipping invalid message:', message);
        continue;
      }

      const { content, role } = message;

      switch (role) {
        case 'user':
          if (content.text) {
            $('.ques_with_ans').append(`
                            <div class="questions_div">
                                <p>${content.text}</p>
                            </div>
                        `);
          }
          break;

        case 'assistant':
          // Handle text messages
           if (content.text) {
             const showAvatar = shouldShowAvatar();
             const formattedText = formatMessageContent(content.text);
             $('.ques_with_ans').append(`
      <div class="answers_div">
        <div class="ans_text ${!showAvatar ? 'no-avatar' : ''}">
          ${
            showAvatar
              ? `
            <span class="pr-2">
              <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon">
            </span>
          `
              : ''
          }
          <div class="chat-text ${!showAvatar ? 'continuous-message' : ''}">
            ${formattedText}
          </div>
        </div>
      </div>
    `);
           }

          // Handle button messages
          if (content.buttons?.length && message === lastValidButtonMessage) {
            const showAvatar = shouldShowAvatar();
            const buttonHtml = content.buttons
              .map(
                button => `
        <div class="default-que two card_div msgbuttons">
          <p>${button}</p>
        </div>
      `
              )
              .join('');

            $('.ques_with_ans').append(`
      <div class="answers_div ${!showAvatar ? 'no-avatar' : ''}">
        ${
          showAvatar
            ? `
          <span class="pr-2">
            <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon">
          </span>
        `
            : ''
        }
        <div class="button-animation-container">
          ${buttonHtml}
        </div>
      </div>
    `);
          }

          // Handle product messages
          if (content.products?.length) {
            const uniqueSwiperId = `swiper-${Date.now()}`; // Unique ID for this product carousel

            // Create product swiper HTML
            const productCarouselHtml = `
    <div class="product-swiper-container" data-swiper-id="${uniqueSwiperId}">
      <div class="swiper ${uniqueSwiperId}">
        <div class="swiper-wrapper">
          ${content.products
            .map(
              (product, i) => `
            <div class="swiper-slide" data-product-id="${product.ProductCode}">
              <div class="product-card clickable-product" data-index="${i}" data-track="product-card"
                data-code="${product.ProductCode}"
                data-upper-img="${product.prdupperlargeimg || ''}"
                data-lower-img="${product.prdlowerlargeimg || ''}"
                data-back-img="${product.prdlargeimg || ''}"
                data-small-img="${product.prdsimage || ''}"
                data-title="${product.title || ''}"
                data-price="${product.NetPrice}"
                data-pdp-link="${product.pdpLink}"
                data-mtm-link="${product.MTMLink || ''}"
                data-stitchingtype="${product.stitchingtype || ''}"
                data-size="${product.prdSize || ''}"
                ${product.pdpLink ? `href="${product.pdpLink}"` : ''}
              >
                <div class="product-image-container">
                  <img class="product-image" 
                    src="${product.prdhisimg}" 
                    alt="${product.title || ''}"
                    loading="lazy"
                    onerror="this.src='${placeholderImg}'"
                  />
                </div>
                <div class="product-details">
                  <h3 class="product-title">${product.title || ''}</h3>
                  <p class="product-price">${product.NetPrice}</p>
                  <div class="pin-button ${
                    product.pinned ? 'pinned' : 'unpinned'
                  }" 
                    data-product-code="${product.ProductCode}"
                    data-swiper-id="${uniqueSwiperId}">
                    <img src="/Images/Pin.svg" alt="Pin icon" class="pin-icon"/>
                    <span class="pin-text">${
                      product.pinned ? 'Unpin' : 'Pin'
                    }</span>
                  </div>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      <div class="swiper-custom-nav">
        <div class="swiper-button-prev swiper-button-prev-${uniqueSwiperId}">
          <img src="/Images/left_arrow.svg" alt="Previous" />
        </div>
        <div class="swiper-button-next swiper-button-next-${uniqueSwiperId}">
          <img src="/Images/right_arrow.svg" alt="Next" />
        </div>
      </div>
      <div class="swiper-pagination swiper-pagination-${uniqueSwiperId}"></div>
    </div>
  `;

            // Append the carousel to the chat
            $('.ques_with_ans').append(`
    <div class="answers_div">
      ${productCarouselHtml}
    </div>
  `);
            setTimeout(() => {
              const swiper = initializeSwiper(uniqueSwiperId);
              setupProductHandlers(uniqueSwiperId);

              // Update arrows and progress
              swiper.update();
              updateArrowVisibility(swiper, uniqueSwiperId);

              // Store swiper instance
              if (!window.swiperInstances) {
                window.swiperInstances = new Map();
              }
              window.swiperInstances.set(uniqueSwiperId, swiper);
            }, 0);
          }
          break;

        default:
          console.warn('Unknown message role:', role);
          break;
      }
    }

    // Setup handlers for products after rendering
    setupProductHandlers();

    pastChatDisplayed = true;
    console.log('Past chat display completed');

    // Update UI after loading past chat
    smoothStreamScroll();
    $('.header-chat .newChat').css('display', 'block');

    // Focus input on desktop
    if (window.innerWidth > 993) {
      $('#search-input').focus();
    }
  } catch (error) {
    console.error('Error loading past chat:', error);
    pastChatDisplayed = true;
    handlePastChatError();
  }
}

function handlePastChatError() {
  // Clean up any loading states
  $('.darban-initial-loader, .loading-message').remove();
  $('.ques_with_ans').empty();

  // Clear cookies
  wsHandler.cookieHandler.deleteCookie(
    wsHandler.cookieHandler.currentCookieName
  );
  wsHandler.cookieHandler.deleteCookie(
    wsHandler.cookieHandler.checkoutCookieName
  );

  // Initialize new chat
  wsHandler.send({
    action: 'zoyaNewChat',
    userId: userid,
    firstName: firstName,
    lastName: lastName,
    email: userEmailid,
    clientId: clientId,
    currentPage: getCurrentUrl(),
    forceNewSession: true,
  });

  window.pageTracker?.queuePageLoadEvent(true);
}

const MessageState = {
  isStreaming: false,
  pendingButtons: null,
  currentMessageId: null,
};

/** Handles streaming message display */
const NUMBER_LIST_PATTERN = /^\d+\./;
const UNICODE_PATTERN = /\\u[\dA-F]{4}/gi;

function formatMessageContent(message) {
  try {
    if (!message) return '';

    // Handle Unicode and clean up text
    let processedText = message
      .replace(UNICODE_PATTERN, match =>
        String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
      )
      .replace(/^"|"$/g, '')
      .trim();

    // Fix escaped HTML attributes
    processedText = fixEscapedHtml(processedText);

    // Handle newlines
    processedText = processedText
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => formatLine(line.trim()))
      .filter(line => line)
      .join('');

    return processedText;
  } catch (error) {
    console.error('Error formatting message:', error);
    return message; // Return original message if formatting fails
  }
}

function formatLine(line) {
  if (!line) return '';

  // Handle numbered lists
  if (NUMBER_LIST_PATTERN.test(line)) {
    const [number, ...rest] = line.split('.');
    const content = rest.join('.').trim();
    const parts = content.split(':');

    if (parts.length > 1) {
      const [header, ...description] = parts;
      return `<span class="list">${number}. <strong>${header.trim()}</strong>: ${processLine(
        description.join(':').trim()
      )}</span>`;
    }
    return `<span class="list">${number}. ${processLine(content)}</span>`;
  }

  // Handle bullet points
  if (line.startsWith('-') || line.startsWith('•')) {
    return createBulletPoint(line);
  }

  // Regular line
  return `<span class="line">${processLine(line)}</span>`;
}

function createBulletPoint(text) {
  const content = text.substring(1).trim();
  const parts = content.split(':');

  if (parts.length > 1) {
    const [header, ...description] = parts;
    return `<span class="bullet">• <strong>${header.trim()}</strong>: ${processLine(
      description.join(':').trim()
    )}</span>`;
  }

  return `<span class="bullet">• ${processLine(content)}</span>`;
}

function fixEscapedHtml(text) {
  return text
    .replace(/href=\\?"([^"]+)\\?"/g, 'href="$1"')
    .replace(/target=\\?"([^"]+)\\?"/g, 'target="$1"');
}

function processLine(text) {
  if (!text) return '';

  // Make links clickable if not already in HTML - using original pattern
  return text.replace(
    /(?<!href="|">)(https?:\/\/[^\s<]+)(?!<\/a>)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

const handleStreamingMessage = async data => {
  // Remove any duplicate typing indicators
  $('.typing-indicator-message').remove();
  $('.new-chat-typing').remove();

  if (data.type === 'streamingMessage') {
    MessageState.isStreaming = true;
    MessageState.currentMessageId = data.messageId;

    await new Promise(resolve => {
      const $buttons = $(
        '.button-animation-container, .msgbuttons, .default-que.two.card_div.msgbuttons'
      );
      if ($buttons.length) {
        $buttons.fadeOut(300, function () {
          $(this).remove();
          resolve();
        });
      } else {
        resolve();
      }
    });

    // Remove empty containers
    $(
      '.answers_div:empty, .loading-message, .typing-indicator-message'
    ).remove();

    // Ensure containers are visible and clean
    $('.default_screen').hide();
    $('.listing_div').show();
    disableChatInput();

    // Create container if needed
    if ($('.ques_with_ans').length === 0) {
      $('.listing_div').append('<div class="ques_with_ans"></div>');
    }

    // Format the message if it exists
    const formattedMessage = data.message
      ? formatMessageContent(data.message)
      : '';

    const shouldShowAvatar = () => {
      // Always show avatar for first message
      if ($('.ques_with_ans > div').length === 0) return true;

      const $lastElement = $('.ques_with_ans > div').last();

      // Show avatar if previous element was:
      return (
        $lastElement.hasClass('questions_div') || // User message
        $lastElement.hasClass('loading-message') || // Loading indicator
        $lastElement.find('.msgbuttons').length > 0 || // Button container
        $lastElement.find('.product-swiper-container').length > 0 || // Product display
        $lastElement.find('.swiper').length > 0 || // Swiper container
        $lastElement.find('.ans_pro_main').length > 0 || // Product main container
        !$lastElement.hasClass('answers_div') || // Not an answer div
        $lastElement.hasClass('product-swiper-container') || // Product container
        $lastElement.hasClass('swiper') // Swiper element
      );
    };

    // Check if this is a new message or continuation
    const messageSelector = `.mans-${data.messageId}`;
    if ($(messageSelector).length === 0) {
      // Determine if avatar should be shown
      const showAvatar = shouldShowAvatar();

      // Create new message container
      const messageHtml = `
        <div class="answers_div mans-${data.messageId}">
          <div class="ans_text ${!showAvatar ? 'no-avatar' : ''}">
            ${
              showAvatar
                ? `
            <span class="pr-2">
                <img width="27" src="/Images/zoya_chat_icon.png"  alt="zoya_chat_icon" />
            </span>
            `
                : ''
            }
            <div class="chat-text pans-${data.messageId} ${
        !showAvatar ? 'continuous-message' : ''
      }">${formattedMessage}</div>
          </div>
        </div>
      `.trim();

      // Only append if we have content
      if (formattedMessage) {
        $('.ques_with_ans').append(messageHtml);
      }

      if (
        !$('.default_screen').is(':visible') &&
        $('.typing-indicator-message').length === 0
      ) {
        const typingIndicatorHtml = `
    <div class="answers_div typing-indicator-message" style="opacity: 0; transform: translateY(10px);">
      <div class="ans_text">
        <span class="pr-2">
          <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
        </span>
        <div class="typing-indicator">
          <span class="jump1"></span>
          <span class="jump2"></span>
          <span class="jump3"></span>
        </div>
      </div>
    </div>
  `.trim();

        const $typingIndicator =
          $(typingIndicatorHtml).appendTo('.ques_with_ans');
        requestAnimationFrame(() => {
          $typingIndicator.css({
            transition: 'all 0.3s ease-out',
            opacity: '1',
            transform: 'translateY(0)',
          });
        });
      }
    } else {
      // Update existing message if it has content
      const messageContainer = $(`.pans-${data.messageId}`);
      if (formattedMessage) {
        const currentHtml = messageContainer.html();
        messageContainer.html(currentHtml + ' ' + formattedMessage);
      }
    }

    // Handle pending buttons
    if (MessageState.pendingButtons) {
      handlePendingButtons();
    }

    // Ensure smooth scroll
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('.right-chat');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth',
        });
      }
    });
  }

  // Show new chat button
  $('.header-chat .newChat').css('display', 'block');
};

function cleanupEmptyDivs() {
  $(
    '.answers_div:empty, .questions_div:empty, .button-animation-container:empty'
  ).remove();
  $('.ans_text:empty').closest('.answers_div').remove();
  $('.chat-text:empty').closest('.answers_div').remove();
}

// Regular cleanup interval
setInterval(cleanupEmptyDivs, 5000);

const createNewMessage = data => {
  // Remove any existing loading indicators
  $('.loading-message').remove();

  // Create and append message container
  const $messageContainer = $(`
    <div class="answers_div mans-${data.messageId}">
      <div class="ans_text">
        <span class="pr-2">
          <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
        </span>
        <div class="chat-text pans-${data.messageId}">${data.message}</div>
      </div>
    </div>
  `).appendTo('.ques_with_ans');

  smoothStreamScroll();
};

const appendToMessage = data => {
  const messageContainer = $(`.pans-${data.messageId}`);
  const currentText = messageContainer.html();
  messageContainer.html(currentText + ' ' + data.message);
  smoothStreamScroll();
};

/** Creates new streaming message container */
const createNewStreamingMessage = async data => {
  // Show loading animation
  const $loading = await showLoading();
  await new Promise(resolve => setTimeout(resolve, 2000));
  await hideLoading($loading);

  // Create and append message container
  const $messageContainer = $(`
    <div class="answers_div mans-${data.messageId}" style="opacity: 0; transform: translateY(20px);">
      <div class="ans_text">
        <span class="pr-2">
          <img width="27" src="/Images/zoya_chat_icon.png"  alt="zoya_chat_icon" />
        </span>
        <div class="chat-text pans-${data.messageId}"></div>
      </div>
    </div>
  `).appendTo('.ques_with_ans');

  // Animate container entrance
  await new Promise(resolve => {
    requestAnimationFrame(() => {
      $messageContainer.css({
        transition: 'all 0.3s ease-out',
        opacity: '1',
        transform: 'translateY(0)',
      });
      setTimeout(resolve, 300);
    });
  });

  // Animate text by words
  const messageContainer = $(`.pans-${data.messageId}`);
  const words = data.message.split(' ');
  for (let i = 0; i < words.length; i++) {
    await new Promise(resolve => {
      setTimeout(() => {
        messageContainer.html(
          i === 0 ? words[i] : messageContainer.html() + ' ' + words[i]
        );
        smoothStreamScroll();
        resolve();
      }, 50);
    });
  }
};

/** Appends text to existing message */
const appendToExistingMessage = async data => {
  const messageContainer = $(`.pans-${data.messageId}`);
  const currentText = messageContainer.html();
  const newWords = data.message.split(' ');

  for (let i = 0; i < newWords.length; i++) {
    await new Promise(resolve => {
      setTimeout(() => {
        if (i === 0 && currentText) {
          messageContainer.html(currentText + ' ' + newWords[i]);
        } else {
          messageContainer.html(messageContainer.html() + ' ' + newWords[i]);
        }
        smoothStreamScroll();
        resolve();
      }, 50);
    });
  }
};

const handleSendMessageLoading = data => {
  const existingLoadingMessage = $('.loading-message');
  const loadingHtml = `
    <div class="answers_div loading-message" style="opacity: 0; transform: translateY(20px);">
      <div class="ans_text">
        <span class="pr-2">
          <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
        </span>
        <div class="loading-content d-flex align-items-center gap-2">
          <span class="loading-text font-italic">${
            data.message || 'Browsing products'
          }</span>
          <div class="typing-indicator d-inline-flex align-items-center ms-1">
            <span class="jump1"></span>
            <span class="jump2"></span>
            <span class="jump3"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Store current scroll position
  const chatContainer = $('.ques_with_ans');
  const scrollPos = chatContainer.scrollTop();

  if (existingLoadingMessage.length) {
    existingLoadingMessage.fadeOut(200, function () {
      $(this).remove();
      const $newMessage = $(loadingHtml).appendTo(chatContainer);

      requestAnimationFrame(() => {
        $newMessage.css({
          transition: 'all 0.3s ease-out',
          opacity: '1',
          transform: 'translateY(0)',
        });

        // Restore scroll position and then smooth scroll to bottom
        chatContainer.scrollTop(scrollPos);
        smoothStreamScroll();
      });
    });
  } else {
    const $newMessage = $(loadingHtml).appendTo(chatContainer);

    requestAnimationFrame(() => {
      $newMessage.css({
        transition: 'all 0.3s ease-out',
        opacity: '1',
        transform: 'translateY(0)',
      });
      smoothStreamScroll();
    });
  }
};

/** Handles product message display and animations */
const handleSendMessageProducts = async data => {
  // Add product animations if not present
  if (!document.getElementById('product-animations')) {
    const animationStyles = `
      @keyframes fadeInUp {
        0% {
          opacity: 0;
          transform: translateY(20px) translateZ(0);
        }
        100% {
          opacity: 1;
          transform: translateY(0) translateZ(0);
        }
      }

      .swiper-slide {
        opacity: 0;
        animation: fadeInUp 0.7s ease forwards;
        will-change: transform;
        backface-visibility: hidden;
      }

      .product-card {
        transform: translateZ(0);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        will-change: transform;
      }

      .product-card:hover {
        transform: translateY(-5px) translateZ(0);
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'product-animations';
    styleSheet.textContent = animationStyles;
    document.head.appendChild(styleSheet);
  }

  $('.loading-message').fadeOut(300, function () {
    $(this).remove();
  });

  $('.default_screen').hide();
  $('.listing_div').show();
  $('.right-chat .is-typing').hide();

  // Check if we have products
  if (!data?.productsData || data.productsData.length === 0) {
    console.log('No products found in response:', data);
    return;
  }

  // Only proceed with display if we have products
  if (data.type === 'products') {
    await displayProducts(data);
  }

  // Add typing indicator after products for continued conversation
  if (!$('.default_screen').is(':visible')) {
    const typingHtml = `
    <div class="answers_div typing-indicator-message" style="opacity: 0; transform: translateY(10px);">
      <div class="ans_text">
        <span class="pr-2">
          <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
        </span>
        <div class="typing-indicator">
          <span class="jump1"></span>
          <span class="jump2"></span>
          <span class="jump3"></span>
        </div>
      </div>
    </div>
  `;

    const $typingIndicator = $(typingHtml).appendTo('.ques_with_ans');
    requestAnimationFrame(() => {
      $typingIndicator.css({
        transition: 'all 0.3s ease-out',
        opacity: '1',
        transform: 'translateY(0)',
      });
    });
  }

  smoothStreamScroll();
};


function handleInternalServerError(error) {
  // Remove existing error messages and loading states
  $('.loading-message, .typing-indicator-message').remove();

  // Parse error message if it's a string
  let errorMessage;
  try {
    if (typeof error === 'string') {
      const parsed = JSON.parse(error);
      errorMessage = parsed.error || 'An error occurred';
    } else {
      errorMessage = error.message || 'An error occurred';
    }
  } catch (e) {
    errorMessage = error.toString();
  }

  // Remove any existing error messages first
  $('.error-message').remove();

  // Add error message to chat with unique identifier
  const errorHtml = `
        <div class="answers_div error-message" style="opacity: 0; transform: translateY(20px);">
            <div class="ans_text">
                <span class="pr-2">
                    <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
                </span>
                <div class="error-content bg-red-50 p-4 rounded-lg">
                    <p class="text-red-700 mb-3">We're experiencing some technical difficulties. Please try again later.</p>
                </div>
            </div>
        </div>
    `;

  const $errorMessage = $(errorHtml).appendTo('.ques_with_ans');

  // Animate error message entrance
  requestAnimationFrame(() => {
    $errorMessage.css({
      transition: 'all 0.3s ease-out',
      opacity: '1',
      transform: 'translateY(0)',
    });
  });

  // Enable chat input
  enableChatInput();

  // Add click handler for retry button
  $('.retry-connection-btn').on('click', async function () {
    const $button = $(this);
    $button.prop('disabled', true).text('Retrying...');

    try {
      // Check internet connection
      await checkInternetConnection();

      // If connection is successful, remove error message with animation
      $errorMessage.css({
        transition: 'all 0.3s ease-out',
        opacity: '0',
        transform: 'translateY(20px)',
      });

      // Remove error message after animation
      setTimeout(() => {
        $errorMessage.remove();
      }, 300);

      // Attempt to reconnect WebSocket
      if (wsHandler) {
        wsHandler.reconnectAttempts = 0;
        await wsHandler.connect();
      }

      // Retry last message if it exists
      if (lastAttemptedMessage) {
        sendMessageOnSearch(
          lastAttemptedMessage.userMessage,
          lastAttemptedMessage.buttonReply
        );
      }
    } catch (error) {
      // If retry fails, re-enable button
      $button.prop('disabled', false).text('Retry Connection');
    }
  });

  // Set up WebSocket connection status monitoring
  const connectionChecker = setInterval(() => {
    if (wsHandler?.ws?.readyState === WebSocket.OPEN) {
      // If connection is restored, remove error message with animation
      const $existingError = $('.error-message');
      if ($existingError.length) {
        $existingError.css({
          transition: 'all 0.3s ease-out',
          opacity: '0',
          transform: 'translateY(20px)',
        });

        setTimeout(() => {
          $existingError.remove();
        }, 300);
      }
      clearInterval(connectionChecker);
    }
  }, 1000);

  // Clear connection checker after 30 seconds to prevent memory leaks
  setTimeout(() => clearInterval(connectionChecker), 30000);
}

const placeholderImg =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Displays products using Swiper */
const displayProducts = async data => {
  if ($('.mans-' + data.messageId).length !== 0) return;

  const uniqueSwiperId = 'swiper-' + data.messageId;

  // Create product swiper HTML
  $('.ques_with_ans').append(`
    <div class="product-swiper-container" data-swiper-id="${uniqueSwiperId}">
      <div class="swiper ${uniqueSwiperId}">
        <div class="swiper-wrapper">
          ${data.productsData
            .map(
              (item, i) => `
            <div class="swiper-slide" data-product-id="${item.ProductCode}">
              <div class="product-card clickable-product" data-index="${i}" data-track="product-card"
                data-code="${item.ProductCode}"
                data-upper-img="${item.prdupperlargeimg}"
                data-lower-img="${item.prdlistingimage}"
                data-back-img="${item.prdlargeimg}"
                data-small-img="${item.prdsimage}"
                data-title="${item.title}"
                data-price="${item.NetPrice}"
                data-pdp-link="${item.pdpLink}"
                data-mtm-link="${item.MTMLink}"
                data-size="${item.prdSize}"
                data-stitchingtype="${item.stitchingtype || ''}"
                ${item.pdpLink ? `href="${item.pdpLink}"` : ''}
              >
                <div class="product-image-container">
                  <img class="product-image" 
                    src="${item.prdhisimg}" 
                    alt="${item.title}"
                    loading="lazy"
                    onerror="this.src='${placeholderImg}'"
                  />
                </div>
                <div class="product-details">
                  <h3 class="product-title">${item.title}</h3>
                  <p class="product-price">${item.NetPrice}</p>
                  <div class="pin-button ${
                    item.pinned ? 'pinned' : 'unpinned'
                  }" 
                    data-product-code="${item.ProductCode}"
                    data-swiper-id="${uniqueSwiperId}">
                    <img src="/Images/Pin.svg" alt="Pin icon" class="pin-icon"/>
                    <span class="pin-text">${
                      item.pinned ? 'Unpin' : 'Pin'
                    }</span>
                  </div>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      <div class="swiper-custom-nav">
        <div class="swiper-button-prev swiper-button-prev-${uniqueSwiperId}">
          <img src="/Images/left_arrow.svg" alt="Previous" />
        </div>
        <div class="swiper-button-next swiper-button-next-${uniqueSwiperId}">
          <img src="/Images/right_arrow.svg" alt="Next" />
        </div>
      </div>
      <div class="swiper-pagination swiper-pagination-${uniqueSwiperId}"></div>
    </div>
  `);

  // Initialize Swiper
  const swiper = initializeSwiper(uniqueSwiperId);
  setupProductHandlers(uniqueSwiperId);

  setTimeout(() => {
    swiper.update();
    updateArrowVisibility(swiper, uniqueSwiperId);
  }, 100);

  // Store swiper instance
  if (!window.swiperInstances) {
    window.swiperInstances = new Map();
  }
  window.swiperInstances.set(uniqueSwiperId, swiper);
};

document.querySelectorAll('.product-image').forEach(img => {
  img.onerror = () => (img.src = placeholderImg);
});

/** Initialize Swiper with configurations */
const initializeSwiper = uniqueSwiperId => {
  const slideWidth = 130;
  const spaceBetween = 12;

  // Create and append progress bar
  const swiperContainer = document.querySelector(`.${uniqueSwiperId}`);
  const progressContainer = document.createElement('div');
  progressContainer.className = 'swiper-custom-progress';
  progressContainer.style.cssText = `
    position: absolute;
    bottom: -15px; /* Changed from -10px to -15px to move it down */
    left: 0;
    right: 5px; /* Added right margin to ensure full width coverage */
    height: 4px;
    margin: 0 10px;
    width: calc(100% - 25px); /* Adjusted width calculation to account for right margin */
    background: rgba(0,0,0,0.1);
    border-radius: 2px;
    overflow: hidden;
    z-index: 10;
  `;

  const progressBar = document.createElement('div');
  progressBar.className = 'swiper-custom-progress-bar';
  progressBar.style.cssText = `
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, #FF0099 0%, #FF66CC 100%);
    transform-origin: left;
    transform: scaleX(0);
    transition: transform 0.3s ease;
    border-radius: 2px;
  `;

  progressContainer.appendChild(progressBar);
  swiperContainer.appendChild(progressContainer);

  return new Swiper(`.${uniqueSwiperId}`, {
    slidesPerView: 'auto',
    spaceBetween: spaceBetween,
    grabCursor: true,
    observer: true,
    observeParents: true,
    watchOverflow: true,
    watchSlidesProgress: true,
    navigation: {
      prevEl: `.swiper-button-prev-${uniqueSwiperId}`,
      nextEl: `.swiper-button-next-${uniqueSwiperId}`,
    },
    pagination: {
      el: `.swiper-pagination-${uniqueSwiperId}`,
      type: 'progressbar',
    },
    breakpoints: {
      320: {
        slidesPerView: 'auto',
        spaceBetween: spaceBetween,
      },
      768: {
        slidesPerView: 'auto',
        spaceBetween: spaceBetween,
      },
    },
    on: {
      init: function () {
        // Set slide widths
        const slides = this.slides;
        slides.forEach(slide => {
          slide.style.width = `${slideWidth}px`;
        });

        // Initial progress update
        updateSwiperProgress(this);

        // Initial arrow visibility
        setTimeout(() => {
          this.update();
          updateArrowVisibility(this, uniqueSwiperId);
        }, 0);
      },
      slideChange: function () {
        updateSwiperProgress(this);
        updateArrowVisibility(this, uniqueSwiperId);
      },
      progress: function (swiper) {
        updateSwiperProgress(swiper);
      },
      setTransition: function (swiper, duration) {
        const progressBar = swiper.el.querySelector(
          '.swiper-custom-progress-bar'
        );
        if (progressBar) {
          progressBar.style.transition = `transform ${duration}ms ease`;
        }
      },
      resize: function () {
        // Maintain slide widths on resize
        const slides = this.slides;
        slides.forEach(slide => {
          slide.style.width = `${slideWidth}px`;
        });

        this.update();
        updateArrowVisibility(this, uniqueSwiperId);
        updateSwiperProgress(this);
      },
    },
  });
};

// function to handle progress updates
function updateSwiperProgress(swiper) {
  if (!swiper || !swiper.el) return;

  const progressBar = swiper.el.querySelector('.swiper-custom-progress-bar');
  if (!progressBar) return;

  // Calculate total scroll width and current position
  const totalWidth = swiper.virtualSize - swiper.width;
  const currentPosition = -swiper.translate;

  // Calculate progress percentage with a small buffer
  let progress = Math.min(Math.max(currentPosition / totalWidth, 0), 1);

  // Handle edge cases
  if (totalWidth <= 0 || swiper.isEnd) {
    progress = 1; // Force full width when at the end
  }

  // Update progress bar
  requestAnimationFrame(() => {
    progressBar.style.transform = `scaleX(${progress})`;
  });
}

// Updated arrow visibility function
function updateArrowVisibility(swiper, uniqueSwiperId) {
  if (!swiper || !swiper.el) return;

  const prevButton = document.querySelector(
    `.swiper-button-prev-${uniqueSwiperId}`
  );
  const nextButton = document.querySelector(
    `.swiper-button-next-${uniqueSwiperId}`
  );

  // Calculate positions
  const isAtBeginning = swiper.isBeginning || swiper.translate >= 0;
  const isAtEnd =
    swiper.isEnd ||
    Math.abs(swiper.translate) >=
      (swiper.snapGrid[swiper.snapGrid.length - 1] || 0);

  if (prevButton) {
    prevButton.classList.toggle('swiper-button-disabled', isAtBeginning);
    prevButton.style.opacity = isAtBeginning ? '0.35' : '1';
    prevButton.style.pointerEvents = isAtBeginning ? 'none' : 'auto';
  }

  if (nextButton) {
    nextButton.classList.toggle('swiper-button-disabled', isAtEnd);
    nextButton.style.opacity = isAtEnd ? '0.35' : '1';
    nextButton.style.pointerEvents = isAtEnd ? 'none' : 'auto';
  }
}

/** Setup product click and pin handlers */
const setupProductHandlers = uniqueSwiperId => {
  // Product click handler
  $(`.${uniqueSwiperId} .clickable-product`)
    .off('click')
    .on('click', function (e) {
      if ($(e.target).closest('.pin-button').length) {
        return;
      }

      const $this = $(this);
      const productData = {
        code: $this.data('code'),
        upperImg: $this.data('upper-img'),
        lowerImg: $this.data('lower-img'),
        backImg: $this.data('back-img'),
        title: $this.data('title'),
        price: $this.data('price'),
        size: $this.data('size'),
        pdpLink: $this.attr('href') || $this.data('pdp-link') || '#',
        mtmLink: $this.data('mtm-link') || '#',
        stitchingtype: $this.data('stitchingtype'),
      };
      showProductModal(productData);

      enableChatInput()
    });

  // Pin/Unpin handler
  $(`.${uniqueSwiperId} .pin-button`)
    .off('click')
    .on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const button = $(this);
      handlePinButtonClick(button);
    });
};

/**  Handles pin button click events */
const handlePinButtonClick = button => {
  const productCode = button.data('product-code');
  const isPinned = button.hasClass('pinned');
  // const action = isPinned ? 'unpinProduct' : 'pinProduct';
  const buttonText = isPinned ? 'Pin' : 'Pinned';

  // Only send backend message and remove buttons when pinning
  if (!isPinned) {
    // Remove existing button container
    $('.button-animation-container').fadeOut(300, function () {
      $(this).remove();
    });
    $('.default-que.two.card_div.msgbuttons').fadeOut(300, function () {
      $(this).remove();
    });

    // Disable input for pin actions
    disableChatInput();

    // Add typing animation before sending message
    const typingHtml = `
      <div class="answers_div typing-indicator-message" style="opacity: 0; transform: translateY(10px);">
        <div class="ans_text">
          <span class="pr-2">
            <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
          </span>
          <div class="typing-indicator">
            <span class="jump1"></span>
            <span class="jump2"></span>
            <span class="jump3"></span>
          </div>
        </div>
      </div>
    `;

    // Append and animate typing indicator
    const $typingIndicator = $(typingHtml).appendTo('.ques_with_ans');
    requestAnimationFrame(() => {
      $typingIndicator.css({
        transition: 'all 0.3s ease-out',
        opacity: '1',
        transform: 'translateY(0)',
      });
    });

    smoothStreamScroll();

    // Send tracking message only when pinning
    const pinMsg = {
      action: 'sendMessageTest',
      subAction: 'pinProduct',
      userMessage: '',
      sessionId: sessionId,
      userId: userid,
      clientId: clientId,
      currentPage: getCurrentUrl(),
      productCode: productCode,
    };

    if (wsHandler.ws?.readyState === WebSocket.OPEN) {
      wsHandler.send(pinMsg);
    }
  }

  // Handle UI updates for both pin and unpin actions
  button.addClass('transitioning');
  setTimeout(() => {
    button.toggleClass('pinned unpinned');
    button.find('.pin-text').text(buttonText);
    button.removeClass('transitioning');
    enableChatInput();
  }, 150);
};

/** Handles button message display and animations */
const handleSendMessageButtons = async data => {
  // Return if no message data
  if (!data?.message?.length) {
    console.warn('No button data received');
    return;
  }

  // If a streaming message is in progress, store buttons for later
  if (MessageState.isStreaming) {
    MessageState.pendingButtons = data;
    return;
  }

  // Remove existing button containers and empty divs
  $('.button-animation-container').remove();
  $('.answers_div:empty').remove();
  $('.typing-indicator-message').remove();
  $('.default-que.two.card_div.msgbuttons').remove(); // Remove existing buttons

  // Wait for any ongoing animations
  while (isAnimating) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  isAnimating = true;

  try {
    // Show loading animation
    const $buttonLoading = await showLoading();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced wait time
    await hideLoading($buttonLoading);

    // Check for existing identical buttons
    const existingButtons = new Set(
      $('.msgbuttons p')
        .map((_, el) => $(el).text())
        .get()
    );

    // Filter out duplicate buttons
    const uniqueMessages = data.message.filter(
      msg => !existingButtons.has(msg)
    );

    if (uniqueMessages.length === 0) {
      console.log('All buttons already exist');
      return;
    }

    // Create button container with validation
    const $buttonContainer = $(`
      <div class="button-animation-container" style="opacity: 0; transform: translateY(20px);" data-track="send-message-container">
        ${uniqueMessages
          .map(
            message => `
          <div class="default-que two card_div msgbuttons">
            <p>${message}</p>
          </div>
        `
          )
          .join('')}
      </div>
    `);

    // Only append if container has content
    if ($buttonContainer.children().length > 0) {
      $buttonContainer.appendTo('.ques_with_ans');

      // Animate container entrance
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          $buttonContainer.css({
            transition: 'all 0.3s ease-out',
            opacity: '1',
            transform: 'translateY(0)',
          });
          setTimeout(resolve, 300);
        });
      });
    }
  } catch (error) {
    console.error('Error handling buttons:', error);
    // Clean up on error
    $('.button-animation-container:empty').remove();
    $('.answers_div:empty').remove();
  } finally {
    isAnimating = false;
  }

  smoothStreamScroll();
};

/** Handles stream end cleanup */
const handleStreamEnd = () => {
  // Create a promise to handle animations
  const cleanupAnimations = new Promise(resolve => {
    const $elements = $(
      '.typing-indicator-message, .answers_div:has(.typing-indicator), .ans_text:has(.typing-indicator)'
    );

    if ($elements.length === 0) {
      resolve();
      return;
    }

    $elements
      .css({
        opacity: '0',
        transform: 'translateY(10px)',
        transition: 'all 0.3s ease-out',
      })
      .on('transitionend', function () {
        $(this).remove();
        resolve();
      });

    // Fallback in case transition doesn't fire
    setTimeout(resolve, 350);
  });

  // Clean up empty elements
  $('.answers_div:empty, .ans_text:empty').remove();
  $('.loading-message').remove();
  $('.right-chat .is-typing').hide();

  // Reset all processing states
  MessageState.isStreaming = false;
  wsHandler.isProcessingMessage = false;

  // Handle pending buttons first if they exist
  const processPendingButtons = async () => {
    if (MessageState.pendingButtons) {
      try {
        await handlePendingButtons();
      } catch (error) {
        console.error('Error handling pending buttons:', error);
      }
      MessageState.pendingButtons = null;
    }
  };

  // Ensure everything is handled in order
  Promise.all([cleanupAnimations, processPendingButtons()])
    .then(() => {
      // Force enable input after everything is done
      enableChatInput().then(() => {
        // Focus input on desktop
        if (window.innerWidth > 993) {
          $('#search-input').focus();
        }
      });
    })
    .catch(error => {
      console.error('Error in stream end handler:', error);
      // Force enable input even if there was an error
      enableChatInput();
    })
    .finally(() => {
      // Ensure smooth scroll to bottom
      smoothStreamScroll();
    });
};

const handlePendingButtons = async () => {
  if (!MessageState.pendingButtons) return;

  // Small delay to ensure smooth transition after streaming
  await new Promise(resolve => setTimeout(resolve, 300));

    // Process the pending buttons
    await handleSendMessageButtons(MessageState.pendingButtons);

    // Clear pending buttons
    MessageState.pendingButtons = null;
};

/** Global cleanup function */
const cleanup = () => {
  // Clear state
  messageQueue = [];
  isProcessing = false;
  isAnimating = false;

  // Remove event listeners
  $('.ans_pro .chk').off('change');
  $('.clickable-product').off('click');
  $('.pin-button').off('click');

  // Destroy swiper instances
  if (window.swiperInstances) {
    window.swiperInstances.forEach(swiper => swiper.destroy());
    window.swiperInstances.clear();
  }

  // Clean up UI elements
  cleanupUI();
};

/** Updates arrow visibility for swiper */

function cleanupSwiper(messageId) {
  const swiperId = 'swiper-' + messageId;
  if (window.swiperInstances && window.swiperInstances.has(swiperId)) {
    const swiper = window.swiperInstances.get(swiperId);
    if (swiper && typeof swiper.destroy === 'function') {
      swiper.destroy(true, true); // true, true means remove all events and elements
    }
    window.swiperInstances.delete(swiperId);
  }
}

let carouselInstances = [];

function initCarousel() {
  $('.product-scroll-wrapper').each(function (index) {
    const wrapper = $(this);
    const container = wrapper.find('.product-scroll-container');
    const contentWrapper = wrapper.find('.ans_pro_main');
    const leftArrow = wrapper.find('.scroll-arrow.left-arrow');
    const rightArrow = wrapper.find('.scroll-arrow.right-arrow');
    const cards = contentWrapper.find('.product-card');

    let scrollPosition = 0;
    let isAnimating = false;

    function updateArrowVisibility() {
      const maxScroll = contentWrapper[0].scrollWidth - container.width();
      leftArrow.toggleClass('disabled', scrollPosition <= 0);
      rightArrow.toggleClass('disabled', scrollPosition >= maxScroll);
    }

    function scrollCarousel(direction) {
      if (isAnimating) return;

      const cardWidth = cards.first().outerWidth(true);
      const visibleWidth = container.width();
      const scrollAmount = Math.floor(visibleWidth / cardWidth) * cardWidth;

      isAnimating = true;

      if (direction === 'left') {
        scrollPosition = Math.max(0, scrollPosition - scrollAmount);
      } else {
        const maxScroll = contentWrapper[0].scrollWidth - container.width();
        scrollPosition = Math.min(maxScroll, scrollPosition + scrollAmount);
      }

      container.animate(
        { scrollLeft: scrollPosition },
        {
          duration: 300,
          easing: 'easeOutCubic',
          complete: function () {
            isAnimating = false;
            updateArrowVisibility();
          },
        }
      );
    }

    leftArrow.on('click', function () {
      if (!$(this).hasClass('disabled')) {
        scrollCarousel('left');
      }
    });

    rightArrow.on('click', function () {
      if (!$(this).hasClass('disabled')) {
        scrollCarousel('right');
      }
    });

    container.on('scroll', function () {
      scrollPosition = container.scrollLeft();
      updateArrowVisibility();
    });

    // Disable mouse wheel scrolling
    container.on('wheel', function (e) {
      e.preventDefault();
    });

    // Initial visibility check
    updateArrowVisibility();

    carouselInstances.push({
      wrapper,
      container,
      contentWrapper,
      leftArrow,
      rightArrow,
      updateArrowVisibility,
    });
  });
}

function refreshProductAnimations() {
  const cards = document.querySelectorAll('.product-card');
  cards.forEach((card, index) => {
    card.style.animation = 'none';
    card.offsetHeight; // Trigger reflow
    card.style.animation = '';
  });
}

function onNewProductsLoaded() {
  // Clear existing carousel instances
  carouselInstances.forEach(instance => {
    instance.leftArrow.off('click');
    instance.rightArrow.off('click');
    instance.container.off('scroll wheel');
  });
  carouselInstances = [];

  // Reinitialize carousels
  initCarousel();
}

$(document).ready(function () {
  initCarousel();

  if (typeof $.easing.easeOutCubic !== 'function') {
    $.easing.easeOutCubic = function (x, t, b, c, d) {
      return c * ((t = t / d - 1) * t * t + 1) + b;
    };
  }
});

// Handle window resize for all carousels
$(window).on('resize', function () {
  carouselInstances.forEach(instance => {
    instance.updateArrowVisibility();
  });
});

$(window).on(
  'resize',
  _.debounce(() => {
    if (window.swiperInstances) {
      window.swiperInstances.forEach((swiper, id) => {
        if (swiper && !swiper.destroyed) {
          swiper.update();
          updateArrowVisibility(swiper, id);
        }
      });
    }
  }, 250)
);

// First, add the loading styles if not already present
if (!document.getElementById('darban-loading-styles')) {
  const loadingStyles = `
        .darban-initial-loader {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            opacity: 0;
            animation: fadeIn 0.5s ease-out forwards;
        }

        .darban-loader-dots {
            display: inline-flex;
            gap: 8px;
            margin: 15px 0;
        }

        .darban-loader-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: #FF0099;
            opacity: 0.6;
            animation: pulse 1.4s infinite;
        }

        .darban-loader-dot:nth-child(2) { animation-delay: 0.2s; }
        .darban-loader-dot:nth-child(3) { animation-delay: 0.4s; }

        .darban-loader-text {
            color: #666;
            font-size: 14px;
            margin-top: 10px;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .darban-initial-loader.fade-out {
            animation: fadeOut 0.3s ease-out forwards;
        }

        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;

  const styleSheet = document.createElement('style');
  styleSheet.id = 'darban-loading-styles';
  styleSheet.textContent = loadingStyles;
  document.head.appendChild(styleSheet);
}

$(document).on('keydown', '#search-input', function (event) {
  if (event.keyCode === 13 && !event.shiftKey) {
    event.preventDefault();
    var searchbarValue = $(this).val().trim();
    if (searchbarValue !== '') {
      sendMessageOnSearch(searchbarValue);
      $(this).val('');
    } else {
      console.log('Searchbar is empty');
    }
  }
});

$(document).on('click', '.newChat', async function () {
  disableChatInput();

  try {
    await checkInternetConnection();
  } catch (error) {
    // Remove existing loaders and reset opacity
    $('.darban-initial-loader').remove();
    $('.default_screen, .listing_div').css('opacity', '1');

    const retryText = 'Please check your connection and try again';
    const offlineHtml = `
      <div class="answers_div offline-transition" style="opacity: 0; transform: translateY(20px);">
        <div class="ans_text">
          <span class="pr-2">
            <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
          </span>
          <div class="offline-content">
            <div class="offline-message-box">
              <div class="offline-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
                </svg>
              </div>
              <div class="offline-text">
                <h4>No Internet Connection</h4>
                <p>${retryText}</p>
              </div>
              <button class="retry-button" onclick="retryNewChat()">
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    $('.ques_with_ans').append(offlineHtml);

    // Animate offline message entrance
    setTimeout(() => {
      $('.offline-transition').css({
        opacity: '1',
        transform: 'translateY(0)',
      });
    }, 50);

    enableChatInput();
    return;
  }

  // If online, proceed with new chat
  triggerNewChat();
});

// Add this new retry function
async function retryNewChat() {
  const $retryButton = $('.retry-button');
  const $offlineMessage = $('.offline-transition');

  // Disable retry button and update text
  $retryButton.prop('disabled', true).text('Retrying...');

  try {
    await checkInternetConnection();

    // Remove offline message with animation
    $offlineMessage.css({
      opacity: '0',
      transform: 'translateY(20px)',
    });

    setTimeout(() => {
      $offlineMessage.remove();
      triggerNewChat();
    }, 300);
  } catch (error) {
    // Re-enable retry button if connection fails
    $retryButton.prop('disabled', false).text('Retry');
  }
}

function triggerNewChat() {
  // Stop sync before cleanup
  if (window.zyaChatSyncInitialized && window.ZyaChatSync) {
    ZyaChatSync.stopSync();
  }

  // Reset session-related variables while maintaining the same userid
  sessionId = '';
  wsHandler.hasInitializedChat = false;

  // Create a new session promise before cleanup
  if (window.pageTracker) {
    window.pageTracker.createSessionPromise();
  }

  wsHandler.cleanup().then(() => {
    // Reset states
    wsHandler.reconnectAttempts = 0;
    wsHandler.processedChats.clear();
    wsHandler.processedMessages.clear();

    // Clear cookies
    wsHandler.cookieHandler.deleteCookie(wsHandler.cookieHandler.cookieName);
    wsHandler.cookieHandler.deleteCookie(
      wsHandler.cookieHandler.checkoutCookieName
    );

    // Remove ALL existing typing indicators and potential duplicate elements
    $('.typing-indicator-message, .loading-message').remove();

    // Cleanup UI elements with animation
    $(
      '.answers_div:not(.typing-indicator-message), .questions_div, .msgbuttons, .button-animation-container, ' +
        '.product-swiper-container, .swiper, .ans_pro_main, .product-card, ' +
        '.swiper-wrapper, .swiper-slide, .swiper-pagination, .swiper-button-prev, ' +
        '.swiper-button-next, .offline-transition'
    ).fadeOut(300, function () {
      $(this).remove();
    });

    // Cleanup Swiper instances
    if (window.swiperInstances) {
      window.swiperInstances.forEach((swiper, id) => {
        if (swiper && typeof swiper.destroy === 'function') {
          swiper.destroy(true, true);
        }
      });
      window.swiperInstances.clear();
    }

    // Reset UI states without showing loading animation
    $('.default_screen, .listing_div').css('opacity', '0');

    // Add initial loader without typing animation
    $('.content_div').append(`
      <div class="darban-initial-loader">
        <div class="darban-loader-dots">
          <div class="darban-loader-dot"></div>
          <div class="darban-loader-dot"></div>
          <div class="darban-loader-dot"></div>
        </div>
        <div class="darban-loader-text">Starting new chat...</div>
      </div>
    `);

    // Close existing WebSocket gracefully
    if (wsHandler.ws) {
      wsHandler.ws.onclose = null; // Prevent auto-reconnect
      wsHandler.ws.close(1000, 'Intentional closure for new chat');
    }

    setTimeout(() => {
      $('.darban-initial-loader').addClass('fade-out');
      setTimeout(() => {
        $('.darban-initial-loader').remove();

        // Reset display states with animation
        $('.default_screen').css({
          display: 'block',
          opacity: '1',
          transition: 'opacity 0.3s ease-out',
        });
        $('.listing_div').css({
          display: 'none',
          opacity: '1',
        });

        // Animate default buttons
        $('.card_div').each(function (index) {
          $(this)
            .delay(index * 200)
            .fadeIn(2000, function () {
              $(this).css({
                opacity: '1',
                transform: 'translateY(0)',
              });
            });
        });

        // Ensure no existing typing indicators
        $('.typing-indicator-message').remove();

        // Add typing indicator
        const typingHtml = `
          <div class="answers_div typing-indicator-message" style="opacity: 0; transform: translateY(10px);">
            <div class="ans_text">
              <span class="pr-2">
                <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
              </span>
              <div class="typing-indicator">
                <span class="jump1"></span>
                <span class="jump2"></span>
                <span class="jump3"></span>
              </div>
            </div>
          </div>
        `;

        // Append and animate typing indicator
        const $typingIndicator = $(typingHtml).appendTo('.ques_with_ans');
        requestAnimationFrame(() => {
          $typingIndicator.css({
            transition: 'all 0.3s ease-out',
            opacity: '1',
            transform: 'translateY(0)',
          });
        });

        // Reset input state
        $('#chat-input').val('');
        enableChatInput();

        // Remove loading states
        $('.loading-message').remove();
        $('.is-typing').hide();

        // Initialize new connection and handle session
        wsHandler.connect().then(() => {
          // Force initialization of a new chat session
          wsHandler.send({
            action: 'zoyaNewChat',
            userId: userid,
            firstName: firstName,
            lastName: lastName,
            email: userEmailid,
            clientId: clientId,
            currentPage: getCurrentUrl(),
            forceNewSession: true,
          });

          // Use PageTracker to handle new chat request
          if (window.pageTracker) {
            window.pageTracker.handleNewChatRequest({
              suppressTypingAnimation: true,
              isNewChat: true,
            });
          }
        });
      }, 300);
    }, 1500);
  });
}

$(document)
  .off('click', '.questions-default-div .default-que')
  .on('click', '.questions-default-div .default-que', function (e) {
    e.preventDefault();
    disableChatInput();
    $('.listing_div').css({ display: 'block' });
    $('.default_screen').css({ display: 'none' });

    const questionText = $(this).find('p').html();
    const category = $(this).data('category') || '';

    // Add user message
    $('.ques_with_ans').append(
      '<div class="questions_div"><p>' + questionText + '</p></div>'
    );

    // Send message with new format
    sendMessageOnSearch(questionText, questionText, category);
  });

$(document).on('click', '.searchbar input', function () {
  $(this).css({ height: '45px' });
  var newHeight = this.scrollHeight;
  $(this).css('height', newHeight + 'px');
  if (newHeight >= 100) {
    $(this).css({ 'overflow-y': 'scroll', 'overflow-x': 'hidden' });
  } else {
    $(this).css('overflow', 'hidden');
  }
});

$(document).on('click', '#search-input', function () {
  $('.sensitive_info_main').hide();
});

if (window.innerWidth > 993) {
  $(document).on('mouseenter', '.newChat', function () {
    $('.newChat span').css('display', 'block');
  });

  $(document).on('mouseleave', '.newChat', function () {
    setTimeout(function () {
      $('.newChat span').css('display', 'none');
    }, 100);
  });
  $(document).on('mouseenter', '.cht_close', function () {
    $('.cht_close span').css('display', 'block');
  });

  $(document).on('mouseleave', '.cht_close', function () {
    setTimeout(function () {
      $('.cht_close span').css('display', 'none');
    }, 100);
  });
}

// Modify the button click handler
$(document).on(
  'click',
  '.ques_with_ans_main .ques_with_ans .msgbuttons',
  function (e) {
    e.preventDefault();
    const $clickedButton = $(this);
    const buttonText = $clickedButton.find('p').html();
    const category = $clickedButton.data('category') || '';
    const $allButtons = $('.msgbuttons');
    const $buttonContainer = $('.button-animation-container');

    // Hide scrollbar only during animation
    $buttonContainer.css({
      overflow: 'hidden',
      '-ms-overflow-style': 'none',
      'scrollbar-width': 'none',
      'pointer-events': 'none',
    });

    $buttonContainer.on(
      'webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend',
      function () {
        $(this).remove();
      }
    );

    // Store positions and animate buttons
    $allButtons.each(function () {
      const rect = this.getBoundingClientRect();
      $(this).css({
        position: 'absolute',
        top: rect.top + window.scrollY + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        margin: 0,
      });
    });

    $allButtons
      .animate(
        { opacity: 0 },
        {
          duration: 300,
          easing: 'easeOutCubic',
          complete: function () {
            if (this === $clickedButton[0]) {
              sendMessageOnSearch(buttonText, buttonText, category);
            }
            $(this).remove();
          },
        }
      )
      .css({
        transform: 'scale(0.95)',
        transition: 'transform 300ms ease-out',
      });
  }
);

const observeChat = () => {
  const chatContainer = document.querySelector('.ques_with_ans');
  if (!chatContainer) return;

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        smoothStreamScroll();
      }
    });
  });

  observer.observe(chatContainer, {
    childList: true,
    subtree: true,
  });
};

// Initialize observer when document is ready
$(document).ready(function () {
  observeChat();

  // Reinitialize observer after new chat
  $(document).on('click', '.newChat', function () {
    setTimeout(observeChat, 100);
  });
});

$(window).on('resize', function () {
  scrollToBottom(false); // Use instant scroll on resize
});

if (/Android/i.test(navigator.userAgent)) {
  const originalHeight = window.innerHeight;
  window.addEventListener('resize', function () {
    if (window.innerHeight < originalHeight) {
      // Keyboard is visible - adjust input position
      $('.chat_with_cb').css({
        position: 'relative',
        bottom: '0',
      });
    } else {
      // Keyboard is hidden - restore fixed position
      $('.chat_with_cb').css({
        position: 'fixed',
        bottom: '0',
      });
    }
  });
}

// Add modal HTML
$('#zoya-chat-container').append(`
    <div class="product-modal-overlay"></div>
<div class="product-quick-view">
    <button class="quick-view-close">✕</button>
    <div class="product-quick-view-content">
        <div class="quick-view-left">
            <img class="quick-view-main-image" src="" alt="Product">
            <div class="quick-view-thumbnails-scroll">
                <div class="quick-view-thumbnails"></div>
            </div>
        </div>
        <div class="quick-view-right">
            <h1 class="quick-view-title"></h1>
            <div class="quick-view-price"></div>
            <div class="quick-view-sizes">
                <div class="size-options"></div>
            </div>
            <div class="modal-buttons">
                <a href="#" class="quick-view-shop-now" id="quick-view-button" target="_blank" rel="noopener noreferrer">SHOP NOW</a>
                <a href="#" class="quick-view-mtm-now" id="quick-view-button" target="_blank" rel="noopener noreferrer">MADE TO MEASURE</a>
            </div>
            <div class="product-carousel">
                <div class="product-carousel-container"></div>
            </div>
        </div>
    </div>
</div>
`);

// Show product modal function
let modalCarouselData = [];

function showProductModal(data) {
  const modal = $('.product-quick-view');
  const overlay = $('.product-modal-overlay');
  const uniqueModalId = 'modal-swiper-' + Date.now();

  // Set product details
  $('.quick-view-title').text(data.title || data.details_Title);
  $('.quick-view-price').text(data.price || data.details_Netprice);
  $('.quick-view-main-image').attr('src', data.upperImg || data.details_Uimg);

  // Enhanced PDPLink handling
  const pdpLink = data.pdpLink || data.details_Urllink || '#';
  const mtmLink = data.mtmLink || data.details_MTMLink || '';
  const stitchingType = (data.stitchingtype || '').toLowerCase();

  const $modalButtons = $('.modal-buttons');
  $modalButtons.empty(); // Clear existing buttons

  const $shopNowBtn = $(
    `<a href="${pdpLink}" class="quick-view-shop-now mx-auto" id="quick-view-button" target="_blank" rel="noopener noreferrer">SHOP NOW</a>`
  )
    .off('click')
    .on('click', function (e) {
      if (pdpLink === '#') {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      window.open(pdpLink, '_blank');
      enableChatInput();
    });

  if (mtmLink && stitchingType === 'customizable') {
    // If MTM is available, remove center alignment and add both buttons
    $shopNowBtn.removeClass('mx-auto');

    const $mtmBtn = $(
      `<a href="${mtmLink}" class="quick-view-mtm-now" id="quick-view-button" target="_blank" rel="noopener noreferrer">MADE TO MEASURE</a>`
    )
      .off('click')
      .on('click', function (e) {
        e.preventDefault();
        window.open(mtmLink, '_blank');
        enableChatInput();
      });

    $modalButtons.append($shopNowBtn, $mtmBtn);
  } else {
    // Just show centered shop now button
    $modalButtons.append($shopNowBtn);
  }

  // Generate thumbnails
  const thumbnails = [
    { src: data.upperImg || data.details_Uimg, alt: 'Front View' },
    { src: data.lowerImg || data.details_Limg, alt: 'Lower View' },
    { src: data.backImg || data.details_Bimg, alt: 'Back View' },
  ].filter(img => img.src);

  const thumbnailsHtml = thumbnails
    .map(
      (img, index) => `
        <img 
            class="quick-view-thumbnail ${index === 0 ? 'active' : ''}" 
            src="${img.src}" 
            alt="${img.alt}"
            data-main="${img.src}"
        >
    `
    )
    .join('');

  $('.quick-view-thumbnails').html(thumbnailsHtml);

  // Generate size options
  const sizes = (() => {
    const sizeValue = data.size || data.details_prdSize;
    if (!sizeValue) return [];

    // Handle different data types
    const sizeString =
      typeof sizeValue === 'string' ? sizeValue : String(sizeValue);

    return sizeString
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
  })();

  const sizesHtml = sizes
    .map(size => `<div class="size-option">${size}</div>`)
    .join('');

  $('.size-options').html(sizesHtml);

  // Get related products from the current swiper view
  modalCarouselData = [];
  const currentProduct = data.code || data.productCode;
  const currentSwiperId = $(`.clickable-product[data-code="${currentProduct}"]`)
    .closest('.swiper')
    .attr('class')
    .split(' ')[1];

  // Include all products including the current one
  $(`.${currentSwiperId} .clickable-product`).each(function () {
    const $this = $(this);
    const productCode = $this.data('code');

    if (productCode) {
      const productData = {
        code: productCode,
        upperImg: $this.data('upper-img'),
        lowerImg: $this.data('lower-img'),
        backImg: $this.data('back-img'),
        title: $this.data('title'),
        price: $this.data('price'),
        size: $this.data('size'),
        pdpLink: $this.data('pdp-link') || '#',
        mtmLink: $this.data('mtm-link') || '',
        stitchingtype: $this.data('stitchingtype') || '',
      };
      modalCarouselData.push(productData);
    }
  });

  // Generate modal carousel with unique identifier
  const modalSwiperHtml = `
    <div class="swiper ${uniqueModalId}" data-track="product-modal-container">
        <div class="swiper-wrapper">
            ${modalCarouselData
              .map(
                product => `
                <div class="swiper-slide">
                    <div class="product-card" style="height: auto !important;">
                        <div class="product-image-container modal-clickable-product" 
                            data-code="${product.code}"
                            data-upper-img="${product.upperImg}"
                            data-lower-img="${product.lowerImg}"
                            data-back-img="${product.backImg}"
                            data-title="${product.title}"
                            data-price="${product.price}"
                            data-size="${product.size}"
                            data-pdp-link="${product.pdpLink}"
                            data-stitchingtype="${product.stitchingtype || ''}"
                            data-mtm-link="${product.mtmLink}">
                            <img class="product-image"
                                src="${product.upperImg}"
                                alt="${product.title}"
                                loading="lazy"
                                onerror="this.src='${placeholderImg}'"
                            />
                        </div>
                    </div>
                </div>
            `
              )
              .join('')}
        </div>
        <div class="swiper-custom-nav">
            <div class="swiper-button-prev swiper-button-prev-${uniqueModalId}">
                <img src="/Images/left_arrow.svg" alt="Previous" />
            </div>
            <div class="swiper-button-next swiper-button-next-${uniqueModalId}">
                <img src="/Images/right_arrow.svg" alt="Next" />
            </div>
        </div>
        <div class="swiper-custom-progress">
            <div class="swiper-custom-progress-bar"></div>
        </div>
    </div>
  `;

  $('.product-carousel').html(modalSwiperHtml);

  // Show modal
  overlay.fadeIn(200);
  modal.fadeIn(200, function () {
    enableChatInput();
    // Initialize modal Swiper after fade in
    const modalSwiper = new Swiper(`.${uniqueModalId}`, {
      slidesPerView: 'auto',
      spaceBetween: 8,
      grabCursor: true,
      observer: true,
      observeParents: true,
      watchOverflow: true,
      watchSlidesProgress: true,
      navigation: {
        nextEl: `.swiper-button-next-${uniqueModalId}`,
        prevEl: `.swiper-button-prev-${uniqueModalId}`,
      },
      breakpoints: {
        320: {
          slidesPerView: 'auto',
          spaceBetween: 8,
        },
        768: {
          slidesPerView: 'auto',
          spaceBetween: 8,
        },
      },
      on: {
        init: function () {
          // Set initial slide width
          const slideWidth = 130;
          this.slides.forEach(slide => {
            slide.style.width = `${slideWidth}px`;
          });
          updateArrowVisibility(this, uniqueModalId);
          updateModalProgress(this);
        },
        slideChange: function () {
          updateArrowVisibility(this, uniqueModalId);
          updateModalProgress(this);
        },
        progress: function () {
          updateModalProgress(this);
        },
        setTransition: function (swiper, duration) {
          const progressBar = swiper.el.querySelector(
            '.swiper-custom-progress-bar'
          );
          if (progressBar) {
            progressBar.style.transition = `transform ${duration}ms ease`;
          }
        },
        resize: function () {
          // Maintain fixed slide width on resize
          const slideWidth = 130;
          this.slides.forEach(slide => {
            slide.style.width = `${slideWidth}px`;
          });
          this.update();
          updateArrowVisibility(this, uniqueModalId);
          updateModalProgress(this);
        },
      },
    });

    // Store modal swiper instance
    if (!window.swiperInstances) {
      window.swiperInstances = new Map();
    }
    window.swiperInstances.set(uniqueModalId, modalSwiper);
  });

  // Handle thumbnail clicks
  $('.quick-view-thumbnail')
    .off('click')
    .on('click', function () {
      $('.quick-view-thumbnail').removeClass('active');
      $(this).addClass('active');
      $('.quick-view-main-image').attr('src', $(this).data('main'));
    });

  // Handle size selection
  $('.size-option')
    .off('click')
    .on('click', function () {
      const $this = $(this);
      if ($this.hasClass('selected')) {
        // If clicking the same button that's already selected, deselect it
        $this.removeClass('selected');
      } else {
        // If clicking a different button, deselect others and select this one
        $('.size-option').removeClass('selected');
        $this.addClass('selected');
      }
    });

  // Handle product clicks in modal carousel
  $(`.${uniqueModalId} .modal-clickable-product`)
    .off('click')
    .on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const $this = $(this);
      const $currentSwiper = $(this).closest('.swiper')[0].swiper;
      const currentIndex = $currentSwiper.activeIndex;
      const productData = {
        code: $this.data('code'),
        upperImg: $this.data('upper-img'),
        lowerImg: $this.data('lower-img'),
        backImg: $this.data('back-img'),
        title: $this.data('title'),
        price: $this.data('price'),
        size: $this.data('size'),
        pdpLink: $this.data('pdp-link'),
        mtmLink: $this.data('mtm-link'),
        stitchingtype: $this.data('stitchingtype'),
      };

      // Update product details without recreating the carousel
      $('.quick-view-title').text(productData.title);
      $('.quick-view-price').text(productData.price);
      $('.quick-view-main-image').attr('src', productData.upperImg);

      // Update thumbnails
      const thumbnails = [
        { src: productData.upperImg, alt: 'Front View' },
        { src: productData.lowerImg, alt: 'Lower View' },
        { src: productData.backImg, alt: 'Back View' },
      ].filter(img => img.src);

      const thumbnailsHtml = thumbnails
        .map(
          (img, index) => `
          <img 
            class="quick-view-thumbnail ${index === 0 ? 'active' : ''}" 
            src="${img.src}" 
            alt="${img.alt}"
            data-main="${img.src}"
          >
        `
        )
        .join('');

      $('.quick-view-thumbnails').html(thumbnailsHtml);

      // Update size options
      const sizes = (() => {
        const sizeValue = productData.size || productData.details_prdSize;
        if (!sizeValue) return [];

        // Handle different data types
        const sizeString =
          typeof sizeValue === 'string' ? sizeValue : String(sizeValue);

        return sizeString
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(Boolean);
      })();

      // Only generate sizes HTML if there are sizes
      const sizesHtml = sizes.length
        ? sizes.map(size => `<div class="size-option">${size}</div>`).join('')
        : '';

      // Only add the sizes container if there are sizes
      $('.size-options').html(sizesHtml);

      // Show/hide the entire sizes section based on whether there are sizes
      $('.quick-view-sizes').toggle(sizes.length > 0);

      // Update shop now button
      const pdpLink = productData.pdpLink || '#';
      const mtmLink = productData.mtmLink || '';

      // Update shop now button
      $('.quick-view-shop-now')
        .attr('href', pdpLink)
        .off('click')
        .on('click', function (e) {
          if (pdpLink === '#') {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          window.open(pdpLink, '_blank');
        });

      // Show/hide and update MTM button based on link availability
      const stitchingType = (productData.stitchingtype || '').toLowerCase();
      const $mtmBtn = $('.quick-view-mtm-now');

      if (mtmLink && stitchingType === 'customizable') {
        $('.modal-buttons').html(`
    <a href="${pdpLink}" class="quick-view-shop-now" id="quick-view-button" target="_blank" rel="noopener noreferrer">SHOP NOW</a>
    <a href="${mtmLink}" class="quick-view-mtm-now" id="quick-view-button" target="_blank" rel="noopener noreferrer">MADE TO MEASURE</a>
  `);
      } else {
        $('.modal-buttons').html(`
    <a href="${pdpLink}" class="quick-view-shop-now mx-auto" id="quick-view-button" target="_blank" rel="noopener noreferrer">SHOP NOW</a>
  `);
      }

      // Reattach thumbnail click handlers
      $('.quick-view-thumbnail')
        .off('click')
        .on('click', function () {
          $('.quick-view-thumbnail').removeClass('active');
          $(this).addClass('active');
          $('.quick-view-main-image').attr('src', $(this).data('main'));
        });

      // Reattach size selection handlers
      $('.size-option')
        .off('click')
        .on('click', function () {
          const $this = $(this);
          if ($this.hasClass('selected')) {
            $this.removeClass('selected');
          } else {
            $('.size-option').removeClass('selected');
            $this.addClass('selected');
          }
        });

      // Update carousel data array to reflect new current product
      const newModalCarouselData = [];
      modalCarouselData.forEach(product => {
        if (product.code !== productData.code) {
          newModalCarouselData.push(product);
        }
      });
      modalCarouselData = newModalCarouselData;

      // Maintain current slide position
      if ($currentSwiper) {
        $currentSwiper.slideTo(currentIndex, 0);
        updateModalProgress($currentSwiper);
        updateArrowVisibility($currentSwiper, uniqueModalId);
      }
      enableChatInput()
    });
}

// Update cleanup functions
function cleanupModalSwiper() {
  window.swiperInstances?.forEach((swiper, id) => {
    if (id.startsWith('modal-swiper-')) {
      swiper.destroy();
      window.swiperInstances.delete(id);
    }
  });
}

function updateModalProgress(swiper) {
  if (!swiper || !swiper.el) return;

  const progressBar = swiper.el.querySelector('.swiper-custom-progress-bar');
  if (!progressBar) return;

  // Calculate total scroll width and current position
  const totalWidth = swiper.virtualSize - swiper.width;
  const currentPosition = -swiper.translate;

  // Calculate progress percentage
  let progress = Math.min(Math.max(currentPosition / totalWidth, 0), 1);

  // Handle edge cases
  if (totalWidth <= 0 || swiper.isEnd) {
    progress = 1;
  }

  // Update progress bar with transform
  requestAnimationFrame(() => {
    progressBar.style.transform = `scaleX(${progress})`;
  });
}

// Update modal close handlers
$('.quick-view-close, .product-modal-overlay')
  .off('click')
  .on('click', function () {
    $('.product-quick-view, .product-modal-overlay').fadeOut(200, function () {
      cleanupModalSwiper();
      modalCarouselData = [];

      enableChatInput();
    });
  });

// Prevent modal close when clicking modal content
$('.product-quick-view-content')
  .off('click')
  .on('click', function (e) {
    e.stopPropagation();
  });

// Mobile-only viewport and input handling improvements
function initializeMobileChat() {
  // Only run on mobile devices
  if (window.innerWidth >= 768) return;

  const chatInput = document.getElementById('chat-input');
  const chatContainer = document.querySelector('.right-chat');
  const contentDiv = document.querySelector('.content_div');
  const searchSpan = document.querySelector('.search-span');
  let originalHeight = window.innerHeight;

  function adjustForKeyboard() {
    if (!chatInput || !chatContainer) return;

    // Handle input focus
    chatInput.addEventListener('focus', function () {
      setTimeout(() => {
        // Add class for keyboard visible state
        document.body.classList.add('keyboard-visible');

        // Adjust container heights
        chatContainer.style.height = 'calc(100vh - 260px)';
        chatContainer.style.paddingBottom = '80px';

        // Ensure latest messages are visible
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Ensure input is visible
        chatInput.scrollIntoView(false);
      }, 100);
    });

    // Handle input blur
    chatInput.addEventListener('blur', function () {
      setTimeout(() => {
        // Remove keyboard visible class
        document.body.classList.remove('keyboard-visible');

        // Reset container heights
        chatContainer.style.height = 'calc(100vh - 130px)';
        chatContainer.style.paddingBottom = '60px';

        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100);
    });
  }

  // Initialize keyboard handling
  adjustForKeyboard();

  // Handle window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth < 768) {
      const newHeight = window.innerHeight;
      if (newHeight < originalHeight) {
        document.body.classList.add('keyboard-visible');
      } else {
        document.body.classList.remove('keyboard-visible');
      }
    }
  });

  // Improve scroll behavior for new messages
  const chatObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        setTimeout(() => {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);
      }
    });
  });

  const messageContainer = document.querySelector('.ques_with_ans');
  if (messageContainer) {
    chatObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });
  }
}

// Re-initialize on dynamic chat open
$(document).on('click', '.Darban_search', function () {
  if (window.innerWidth < 768) {
    setTimeout(initializeMobileChat, 100);
  }
});

function forceBottomPosition() {
  const listingDiv = document.querySelector('.listing_div');
  const rightChat = document.querySelector('.right-chat');

  if (listingDiv && rightChat) {
    // Force position calculation
    const availableHeight = rightChat.clientHeight;
    const contentHeight = listingDiv.offsetHeight;

    // Set initial margin
    if (availableHeight > contentHeight) {
      listingDiv.style.marginTop = `${
        availableHeight - contentHeight
      }px !important`;
    }

    // Scroll to bottom
    rightChat.scrollTop = rightChat.scrollHeight;
  }
}

// Call on load and after any content changes
window.addEventListener('load', forceBottomPosition);
window.addEventListener('resize', forceBottomPosition);

// Create an observer to watch for content changes
const observer = new MutationObserver(forceBottomPosition);

// Start observing
observer.observe(document.querySelector('.content_div'), {
  childList: true,
  subtree: true,
  characterData: true,
});

// Global state
const chatState = {
  isOpen: false,
  isAnimating: false,
};

// DOM elements
const elements = {
  chatWindow: document.querySelector('.Darban_search_open_window'),
  chatButton: document.querySelector('.Darban_search'),
  closeButton: document.querySelector('#minimise_btn .cht_close'),
  rightChat: document.querySelector('.right-chat'),
  chatWithCb: document.querySelector('.chat_with_cb'),
};

// Check if the device is Android
const isAndroid = /Android/i.test(navigator.userAgent);

// Main toggle function
async function toggleChat(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (chatState.isAnimating) return;
  chatState.isAnimating = true;

  const { chatWindow, chatButton } = elements;

  if (!chatState.isOpen) {
    // Open chat
    chatWindow.style.display = 'block';
    chatButton.style.display = 'none';

    requestAnimationFrame(() => {
      chatWindow.classList.remove('closing');
      chatWindow.classList.add('active');

      if (window.innerWidth < 768) {
        setMobileStyles(chatWindow, true);
      }

      // Force enable input when opening chat
      setTimeout(() => {
        enableChatInput().then(() => {
          const chatInput = document.getElementById('chat-input');
          if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = 'Your questions go here...';
          }
        });
      }, 300);
    });

    chatState.isOpen = true;
  } else {
    // Close chat
    chatWindow.classList.add('closing');
    chatWindow.classList.remove('active');

    if (window.innerWidth < 768) {
      setMobileStyles(chatWindow, false);
    }

    // Delayed display of chat button for animation
    setTimeout(() => {
      chatWindow.style.display = 'none';
      chatButton.style.display = 'block';
      chatState.isOpen = false;

      // Re-enable input when reopening
      enableChatInput().then(() => {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
          chatInput.disabled = false;
          chatInput.placeholder = 'Your questions go here...';
        }
      });
    }, 300);
  }

  setTimeout(() => {
    chatState.isAnimating = false;
  }, 300);
}

document.querySelector('.Darban_search').addEventListener('click', async () => {
  await enableChatInput();
});

// Set mobile styles
function setMobileStyles(chatWindow, enable) {
  const { rightChat, chatWithCb, chatButton } = elements;

  if (enable) {
    document.body.classList.add('chat-open');
    document.body.style.overflow = 'hidden';

    chatWindow.style.height = '100%';
    chatWindow.style.minHeight = isAndroid ? '90vh' : '100vh';
    chatWindow.style.maxHeight = isAndroid ? '100%' : '100vh';

    rightChat.style.flex = 'none';
    rightChat.style.paddingTop = '60px';

    chatWithCb.style.position = 'fixed';
    chatWithCb.style.bottom = '0';
    chatWithCb.style.left = '0';
    chatWithCb.style.right = '0';
    chatWithCb.style.width = '100%';
    chatWithCb.style.background = 'white';
    chatWithCb.style.zIndex = '1000';

    chatButton.style.display = 'none';
  } else {
    document.body.classList.remove('chat-open');
    document.body.style.overflow = '';

    chatWindow.style.height = '';
    chatWindow.style.minHeight = '';
    chatWindow.style.maxHeight = '';

    rightChat.style.flex = '';
    rightChat.style.paddingTop = '';

    chatWithCb.style.position = '';
    chatWithCb.style.bottom = '';
    chatWithCb.style.left = '';
    chatWithCb.style.right = '';
    chatWithCb.style.width = '';
    chatWithCb.style.background = '';
    chatWithCb.style.zIndex = '';

    chatButton.style.display = 'block';
  }
}

// Initialize
function initializeChatToggle() {
  const { chatButton, closeButton } = elements;

  // Remove any existing listeners first
  chatButton.replaceWith(chatButton.cloneNode(true));
  closeButton.replaceWith(closeButton.cloneNode(true));

  // Re-query elements after replacing
  elements.chatButton = document.querySelector('.Darban_search');
  elements.closeButton = document.querySelector('#minimise_btn .cht_close');

  // Add event listeners
  elements.chatButton.addEventListener('click', toggleChat);
  elements.closeButton.addEventListener('click', toggleChat);

  // Add resize event listener
  window.addEventListener('resize', handleResize);
}

// Handle resize
function handleResize() {
  const isMobile = window.innerWidth < 768;
  const { chatWindow, chatButton } = elements;

  if (!isMobile && !chatState.isOpen) {
    chatButton.style.display = 'block';
  } else if (isMobile && !chatState.isOpen) {
    chatButton.style.display = 'block';
  } else if (chatState.isOpen) {
    chatButton.style.display = 'none';
  }

  if (chatState.isOpen && isMobile) {
    setMobileStyles(chatWindow, true);
  } else if (chatState.isOpen && !isMobile) {
    setMobileStyles(chatWindow, false);
  }
}

document.querySelector('.Darban_search').addEventListener('click', async () => {
  resetMessageState();
  await enableChatInput();
});

document
  .querySelector('#minimise_btn .cht_close')
  .addEventListener('click', async () => {
    resetMessageState();
    await enableChatInput();
  });

  const ZyaChatSync = {
    lastFetchTime: 0,
    baseInterval: 20000, // Base interval of 20 seconds
    isUserActive: false,
    activeTimeout: null,
    syncTimeout: null,
    lastMessageCount: 0,

    async fetchPastChatIfNeeded(force = false) {
      if (!sessionId || this.isUserActive) return;

      const now = Date.now();
      const currentMessageCount = $('.questions_div, .answers_div').length;

      // Skip if no changes and not forced
      if (!force && currentMessageCount === this.lastMessageCount) return;

      try {
        const params = new URLSearchParams({
          sessionId: sessionId,
          clientId: clientId,
          version: 'v2',
        });

        const response = await fetch(
          `https://q2rrgmis95.execute-api.us-east-1.amazonaws.com/dev/pastChat?${params}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const messages = data.customerMemory || data.messages || data;

          if (
            Array.isArray(messages) &&
            messages.length > currentMessageCount
          ) {
            await this.updateChatQuietly(messages);
          }

          this.lastMessageCount = messages.length;
          this.lastFetchTime = now;
        }
      } catch (error) {
        console.error('Error fetching past chat:', error);
      }
    },

    async updateChatQuietly(messages) {
      // Store current state
      const chatContainer = $('.right-chat');
      const wasAtBottom =
        chatContainer.scrollTop() + chatContainer.height() >=
        chatContainer[0].scrollHeight - 50;
      const currentFocus = document.activeElement;
      const selectionStart = currentFocus?.selectionStart;
      const selectionEnd = currentFocus?.selectionEnd;

      // Create temporary container
      const tempContainer = document.createElement('div');

      // Find last valid button message
      let lastValidButtonMessage = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === 'assistant' && message.content.buttons?.length) {
          let hasUserMessageAfter = false;
          for (let j = i + 1; j < messages.length; j++) {
            if (messages[j].role === 'user') {
              hasUserMessageAfter = true;
              break;
            }
          }
          if (!hasUserMessageAfter) {
            lastValidButtonMessage = message;
            break;
          }
        }
      }

      // Use the same shouldShowAvatar logic from handlePastChat
      const shouldShowAvatar = () => {
        if ($(tempContainer).children().length === 0) return true;

        const $lastElement = $(tempContainer).children().last();
        return (
          $lastElement.hasClass('questions_div') ||
          $lastElement.hasClass('loading-message') ||
          $lastElement.find('.msgbuttons').length > 0 ||
          $lastElement.find('.product-swiper-container').length > 0 ||
          $lastElement.find('.swiper').length > 0 ||
          $lastElement.find('.ans_pro_main').length > 0 ||
          !$lastElement.hasClass('answers_div') ||
          $lastElement.hasClass('product-swiper-container') ||
          $lastElement.hasClass('swiper')
        );
      };

      for (const message of messages) {
        if (!message.content || !message.role) continue;

        const { content, role } = message;

        if (role === 'user' && content.text) {
          $(tempContainer).append(`
          <div class="questions_div">
            <p>${content.text}</p>
          </div>
        `);
        } else if (role === 'assistant') {
          // Text messages
          if (content.text) {
            const showAvatar = shouldShowAvatar();
            const formattedText = formatMessageContent(content.text);
            $(tempContainer).append(`
            <div class="answers_div">
              <div class="ans_text ${!showAvatar ? 'no-avatar' : ''}">
                ${
                  showAvatar
                    ? `
                  <span class="pr-2">
                    <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon">
                  </span>
                `
                    : ''
                }
                <div class="chat-text ${
                  !showAvatar ? 'continuous-message' : ''
                }">${formattedText}</div>
              </div>
            </div>
          `);
          }

          // Button messages
          if (content.buttons?.length && message === lastValidButtonMessage) {
            const buttonHtml = content.buttons
              .map(
                button => `
            <div class="default-que two card_div msgbuttons">
              <p>${button}</p>
            </div>
          `
              )
              .join('');

            $(tempContainer).append(`
            <div class="answers_div">
              <div class="button-animation-container">
                ${buttonHtml}
              </div>
            </div>
          `);
          }

          // Product messages
          if (content.products?.length) {
            const uniqueSwiperId = `swiper-${Date.now()}`;
            $(tempContainer).append(`
            <div class="answers_div">
              ${this.createProductSwiper(content.products, uniqueSwiperId)}
            </div>
          `);
          }
        }
      }

      // Update DOM only if content differs
      if (tempContainer.innerHTML !== $('.ques_with_ans').html()) {
        $('.ques_with_ans').html(tempContainer.innerHTML);

        // Initialize new swipers
        $(tempContainer)
          .find('.product-swiper-container')
          .each(function () {
            const swiperId = $(this).data('swiper-id');
            if (swiperId) {
              setTimeout(() => {
                const swiper = initializeSwiper(swiperId);
                setupProductHandlers(swiperId);
                swiper.update();
                updateArrowVisibility(swiper, swiperId);

                if (!window.swiperInstances) {
                  window.swiperInstances = new Map();
                }
                window.swiperInstances.set(swiperId, swiper);
              }, 0);
            }
          });

        // Restore scroll position if needed
        if (wasAtBottom) {
          smoothStreamScroll();
        }

        // Restore focus and selection if needed
        if (currentFocus) {
          currentFocus.focus();
          if (
            typeof selectionStart === 'number' &&
            typeof selectionEnd === 'number'
          ) {
            currentFocus.setSelectionRange(selectionStart, selectionEnd);
          }
        }
      }
    },

    createProductSwiper(products, uniqueSwiperId) {
      return `
      <div class="product-swiper-container" data-swiper-id="${uniqueSwiperId}">
        <div class="swiper ${uniqueSwiperId}">
          <div class="swiper-wrapper">
            ${products
              .map(
                (product, i) => `
              <div class="swiper-slide" data-product-id="${
                product.ProductCode
              }">
                <div class="product-card clickable-product" data-index="${i}" data-track="product-card"
                  data-code="${product.ProductCode}"
                  data-upper-img="${product.prdupperlargeimg || ''}"
                  data-lower-img="${product.prdlowerlargeimg || ''}"
                  data-back-img="${product.prdlargeimg || ''}"
                  data-small-img="${product.prdsimage || ''}"
                  data-title="${product.title || ''}"
                  data-price="${product.NetPrice}"
                  data-pdp-link="${product.pdpLink}"
                  data-mtm-link="${product.MTMLink || ''}"
                  data-stitchingtype="${product.stitchingtype || ''}"
                  data-size="${product.prdSize || ''}"
                  ${product.pdpLink ? `href="${product.pdpLink}"` : ''}>
                  <div class="product-image-container">
                    <img class="product-image" 
                      src="${product.prdhisimg}" 
                      alt="${product.title || ''}"
                      loading="lazy"
                      onerror="this.src='${placeholderImg}'"
                    />
                  </div>
                  <div class="product-details">
                    <h3 class="product-title">${product.title || ''}</h3>
                    <p class="product-price">${product.NetPrice}</p>
                    <div class="pin-button ${
                      product.pinned ? 'pinned' : 'unpinned'
                    }" 
                      data-product-code="${product.ProductCode}"
                      data-swiper-id="${uniqueSwiperId}">
                      <img src="/Images/Pin.svg" alt="Pin icon" class="pin-icon"/>
                      <span class="pin-text">${
                        product.pinned ? 'Unpin' : 'Pin'
                      }</span>
                    </div>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
        <div class="swiper-custom-nav">
          <div class="swiper-button-prev swiper-button-prev-${uniqueSwiperId}">
            <img src="/Images/left_arrow.svg" alt="Previous" />
          </div>
          <div class="swiper-button-next swiper-button-next-${uniqueSwiperId}">
            <img src="/Images/right_arrow.svg" alt="Next" />
          </div>
        </div>
        <div class="swiper-pagination swiper-pagination-${uniqueSwiperId}"></div>
      </div>
    `;
    },

    handleUserActivity() {
      this.isUserActive = true;
      if (this.activeTimeout) {
        clearTimeout(this.activeTimeout);
      }
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }

      this.activeTimeout = setTimeout(() => {
        this.isUserActive = false;
        this.scheduleSyncIfNeeded();
      }, 5000);
    },

    scheduleSyncIfNeeded() {
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }

      this.syncTimeout = setTimeout(() => {
        if (!this.isUserActive) {
          this.fetchPastChatIfNeeded();
        }
      }, this.baseInterval);
    },

    initialize() {
      // Monitor user activity
      const activityEvents = ['keydown', 'mousemove', 'touchstart', 'scroll'];
      activityEvents.forEach(event => {
        document
          .querySelector('.right-chat')
          ?.addEventListener(event, () => this.handleUserActivity(), {
            passive: true,
          });
      });

      // Monitor chat input
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.addEventListener('input', () => this.handleUserActivity());
      }

      // Initial sync schedule
      this.scheduleSyncIfNeeded();

      // Handle visibility changes
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          const currentMessageCount = $('.questions_div, .answers_div').length;
          if (currentMessageCount !== this.lastMessageCount) {
            this.fetchPastChatIfNeeded(false);
          }
        }
      });

      // Handle after message send
      const originalSendMessageOnSearch = window.sendMessageOnSearch;
      window.sendMessageOnSearch = (...args) => {
        originalSendMessageOnSearch.apply(window, args);
        this.lastMessageCount = $('.questions_div, .answers_div').length;
        this.scheduleSyncIfNeeded();
      };
    },
  };

  // Initialize after a slight delay to ensure other scripts are loaded
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (!window.zyaChatSyncInitialized) {
        ZyaChatSync.initialize();
        window.zyaChatSyncInitialized = true;
      }
    }, 1000);
  });

// Enhanced Tracking System
const EnhancedTracker = (function () {
  const config = {
    scrollThreshold: 25,
    debounceDelay: 150,
    trackingEnabled: true,
    mouseTrackingEnabled: true,
    elementTrackingEnabled: true,
    inputTrackingEnabled: true,
  };

  // Enhanced state management
  let state = {
    scroll: {
      lastY: 0,
      lastTime: Date.now(),
      direction: 'none',
      totalDistance: 0,
      exitAttempts: 0,
    },
    mouse: {
      position: { x: 0, y: 0 },
      lastPosition: { x: 0, y: 0 },
      isNearExit: false,
      exitAttempts: 0,
    },
    session: {
      startTime: Date.now(),
      isActive: true,
      tabSwitches: 0,
      lastActiveTime: Date.now(),
      inactiveDuration: 0,
      activeDuration: 0,
      totalSessionDuration: 0,
      inactivityThreshold: 1000,
      lastInterval: null,
      inactivityIntervals: [],
      activeIntervals: [],
    },
    elements: {
      tracked: new Map(),
      totalInteractions: 0,
      lastInteraction: null,
    },
    inputs: {
      trackedInputs: new Map(),
      totalKeystrokes: 0,
      lastInputTime: null,
      typingSpeed: 0,
    },
    tab: {
      position: 0,
      total: 0,
      id: null,
      lastUpdate: Date.now(),
    },
  };

  // Utility functions
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Element tracking functions
  function initElementTracking() {
    if (!config.elementTrackingEnabled) return;

    // Initial tracking of existing elements
    trackExistingElements();

    // Set up observer for dynamically added elements
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check the added element itself
            if (node.dataset.track) {
              trackSingleElement(node);
            }
            // Check children of added element
            node.querySelectorAll('[data-track]').forEach(element => {
              trackSingleElement(element);
            });
          }
        });
      });
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-track'],
    });
  }

  function initializeInteractionTracking() {
    // Track buttons
    document.querySelectorAll('.msgbuttons, .default-que').forEach(button => {
      trackSingleElement(button);
    });

    // Track product cards
    document.querySelectorAll('.product-card').forEach(card => {
      trackSingleElement(card);
    });

    // Track pin buttons
    document.querySelectorAll('.pin-button').forEach(button => {
      trackSingleElement(button);
    });

    // Set up observer for dynamically added elements
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for new buttons
            if (
              node.classList.contains('msgbuttons') ||
              node.classList.contains('default-que')
            ) {
              trackSingleElement(node);
            }

            // Check for new product cards
            if (node.classList.contains('product-card')) {
              trackSingleElement(node);
            }

            // Check for new pin buttons
            if (node.classList.contains('pin-button')) {
              trackSingleElement(node);
            }

            // Check children of added nodes
            node
              .querySelectorAll(
                '.msgbuttons, .default-que, .product-card, .pin-button'
              )
              .forEach(element => {
                trackSingleElement(element);
              });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function trackExistingElements() {
    const elementsToTrack = document.querySelectorAll('[data-track]');
    elementsToTrack.forEach(trackSingleElement);
  }

  function trackSingleElement(element) {
    // Only track if not already being tracked
    if (!state.elements.tracked.has(element)) {
      const elementData = {
        id: element.dataset.track,
        clicks: 0,
        hovers: 0,
        timeSpent: 0,
        lastHoverStart: null,
        type: element.tagName.toLowerCase(),
        visible: isElementVisible(element),
        lastInteraction: null,
        added: new Date().toLocaleTimeString(),
      };

      state.elements.tracked.set(element, elementData);
      element.classList.add('tracked-element');

      // Add event listeners
      element.addEventListener('click', () => handleElementClick(element));
      element.addEventListener('mouseenter', () =>
        handleElementHover(element, true)
      );
      element.addEventListener('mouseleave', () =>
        handleElementHover(element, false)
      );
    }
  }

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }

  function handleElementClick(element) {
    const elementData = state.elements.tracked.get(element);
    if (!elementData) return;

    let interactionData = {
      type: 'interaction',
      elementType: element.tagName.toLowerCase(),
      action: 'click',
      timestamp: new Date().toISOString(),
      elementId: elementData.id,
    };

    // Handle quick-view-close button interactions
    if (element.classList.contains('quick-view-close')) {
      interactionData = {
        ...interactionData,
        elementType: 'modal_close',
        interactionType: 'modal_close_click',
        modalType: 'product_quick_view',
      };
    }

    // Handle chat close button (cht_close) interactions
    if (element.classList.contains('cht_close')) {
      interactionData = {
        ...interactionData,
        elementType: 'chat_close',
        interactionType: 'chat_close_click',
      };

      if (wsHandler && wsHandler.ws?.readyState === WebSocket.OPEN) {
        const closeMessage = {
          action: 'trackInteraction',
          subAction: 'chatClose',
          sessionId: sessionId,
          userId: userid,
          clientId: clientId,
          currentPage: getCurrentUrl(),
        };
        wsHandler.send(closeMessage);
      }
    }

    // Handle new chat button interactions
    if (element.classList.contains('newChat')) {
      interactionData = {
        ...interactionData,
        elementType: 'new_chat',
        interactionType: 'new_chat_click',
      };

      if (wsHandler && wsHandler.ws?.readyState === WebSocket.OPEN) {
        const newChatMessage = {
          action: 'trackInteraction',
          subAction: 'newChatClick',
          sessionId: sessionId,
          userId: userid,
          clientId: clientId,
          currentPage: getCurrentUrl(),
        };
        wsHandler.send(newChatMessage);
      }
    }

    // Handle button interactions (msgbuttons and default-que)
    if (
      element.classList.contains('msgbuttons') ||
      element.classList.contains('default-que')
    ) {
      interactionData = {
        ...interactionData,
        elementType: 'button',
        buttonText: element.querySelector('p')?.textContent || '',
        category: element.dataset.category || '',
        interactionType: 'button_click',
        buttonType: element.classList.contains('msgbuttons')
          ? 'message'
          : 'default',
      };

      // Send button click message through WebSocket
      if (wsHandler && wsHandler.ws?.readyState === WebSocket.OPEN) {
        const buttonMessage = {
          action: 'trackInteraction',
          userMessage: element.querySelector('p')?.textContent || '',
          buttonReply: element.querySelector('p')?.textContent || '',
          sessionId: sessionId,
          userId: userid,
          clientId: clientId,
          currentPage: getCurrentUrl(),
          productCode: '',
        };
        wsHandler.send(buttonMessage);
      }
    }

    // Handle product card interactions
    if (
      element.classList.contains('product-card') ||
      element.closest('.product-card')
    ) {
      const productCard = element.classList.contains('product-card')
        ? element
        : element.closest('.product-card');
      const productCode = productCard.dataset.code || '';

      interactionData = {
        ...interactionData,
        elementType: 'product',
        interactionType: 'product_click',
        productData: {
          code: productCode,
          title: productCard.dataset.title || '',
          price: productCard.dataset.price || '',
          pdpLink: productCard.dataset.pdpLink || '',
          size: productCard.dataset.size || '',
          location: productCard.closest('.product-quick-view')
            ? 'modal'
            : 'chat',
        },
      };

      // Send product click message through WebSocket
      if (wsHandler && wsHandler.ws?.readyState === WebSocket.OPEN) {
        const productMessage = {
          action: 'trackInteraction',
          subAction: 'productClick',
          userMessage: '',
          sessionId: sessionId,
          userId: userid,
          clientId: clientId,
          currentPage: getCurrentUrl(),
          productCode: productCode,
          clickLocation: productCard.closest('.product-quick-view')
            ? 'modal'
            : 'chat',
        };
        wsHandler.send(productMessage);
      }
    }

    // Handle pin button interactions with enhanced tracking
    if (element.classList.contains('pin-button')) {
      const isPinned = element.classList.contains('pinned');
      const productParent = element.closest('.product-card');
      const productCode = element.dataset.productCode || '';
      const swiperId = element.dataset.swiperId || '';

      interactionData = {
        ...interactionData,
        elementType: 'pin_button',
        interactionType: 'pin_toggle',
        pinAction: isPinned ? 'unpin' : 'pin',
        productCode: productCode,
        swiperId: swiperId,
        location: element.closest('.product-quick-view') ? 'modal' : 'chat',
        productData: productParent
          ? {
              title: productParent.dataset.title || '',
              price: productParent.dataset.price || '',
              size: productParent.dataset.size || '',
            }
          : {},
      };

      if (
        wsHandler &&
        wsHandler.ws?.readyState === WebSocket.OPEN &&
        !isPinned
      ) {
        const pinMessage = {
          action: 'trackInteraction',
          subAction: 'pinProduct',
          userMessage: '',
          sessionId: sessionId,
          userId: userid,
          clientId: clientId,
          currentPage: getCurrentUrl(),
          productCode: productCode,
          pinLocation: element.closest('.product-quick-view')
            ? 'modal'
            : 'chat',
        };
        wsHandler.send(pinMessage);
      }
    }

    // Update local tracking state
    elementData.clicks++;
    state.elements.totalInteractions++;
    elementData.lastInteraction = {
      type: 'click',
      timestamp: new Date(),
      data: interactionData,
    };
    state.elements.lastInteraction = {
      elementId: elementData.id,
      type: 'click',
      timestamp: new Date(),
      data: interactionData,
    };
  }

  function handleElementHover(element, isEntering) {
    const elementData = state.elements.tracked.get(element);
    if (!elementData) return;

    requestIdleCallback(() => {
      try {
        if (isEntering) {
          elementData.lastHoverStart = Date.now();
          elementData.hovers++;
          state.elements.totalInteractions++;

          const interactionDetails = {
            elementId: elementData.id,
            type: 'hover_start',
            timestamp: new Date().toISOString(),
          };

          // Add product specifics if needed
          if (
            element.classList.contains('product-card') ||
            element.closest('.product-card')
          ) {
            const productCard = element.classList.contains('product-card')
              ? element
              : element.closest('.product-card');

            interactionDetails.elementType = 'product';
            interactionDetails.interactionType = 'product_hover';
            interactionDetails.productCode = productCard.dataset.code || '';
          }

          elementData.lastInteraction = interactionDetails;
          state.elements.lastInteraction = interactionDetails;

          // Send to backend only if WebSocket is ready
          if (wsHandler?.isWebSocketReady?.()) {
            wsHandler.send({
              action: 'trackInteraction',
              sessionId,
              userId: userid,
              clientId,
              currentPage: getCurrentUrl(),
              interaction: interactionDetails,
            });
          }
        } else if (elementData.lastHoverStart) {
          // Handle hover end
          elementData.timeSpent +=
            (Date.now() - elementData.lastHoverStart) / 1000;
          elementData.lastHoverStart = null;

          const interactionDetails = {
            elementId: elementData.id,
            type: 'hover_end',
            timestamp: new Date().toISOString(),
            duration: elementData.timeSpent,
          };

          // Send hover end data if WebSocket ready
          if (wsHandler?.isWebSocketReady?.()) {
            wsHandler.send({
              action: 'trackInteraction',
              sessionId,
              userId: userid,
              clientId,
              currentPage: getCurrentUrl(),
              interaction: interactionDetails,
            });
          }
        }
      } catch (error) {
        console.error('Error handling element hover:', error);
      }
    });
  }

  // Mouse tracking
  function isNearTopExit(mouseY) {
    return mouseY < 50;
  }

  function isNearCloseButton(x, y) {
    return x > window.innerWidth - 45 && y < 40;
  }

  function handleMouseMove(event) {
    state.mouse.lastPosition = { ...state.mouse.position };
    state.mouse.position = { x: event.clientX, y: event.clientY };

    const nearExit =
      isNearTopExit(event.clientY) ||
      isNearCloseButton(event.clientX, event.clientY);

    if (nearExit && !state.mouse.isNearExit) {
      state.mouse.exitAttempts++;
      state.mouse.isNearExit = true;
      logExitAttempt(event);
    } else if (!nearExit) {
      state.mouse.isNearExit = false;
    }
  }

  // Scroll tracking
  function handleScroll() {
    const currentScroll = window.scrollY;
    const currentTime = Date.now();
    const scrollDiff = Math.abs(currentScroll - state.scroll.lastY);

    state.scroll.direction = currentScroll > state.scroll.lastY ? 'down' : 'up';
    state.scroll.totalDistance += scrollDiff;
    state.scroll.speed = scrollDiff / (currentTime - state.scroll.lastTime);
    state.scroll.lastY = currentScroll;
    state.scroll.lastTime = currentTime;
  }

  // Visibility and exit tracking
  function handleVisibilityChange() {
    const currentTime = Date.now();

    if (document.hidden) {
      state.session.tabSwitches++;

      if (state.session.isActive) {
        state.session.isActive = false;
        state.session.lastActiveTime = currentTime;
      }

      logEvent('TAB_HIDDEN', {
        tabSwitches: state.session.tabSwitches,
        lastPosition: state.mouse.position,
      });
    } else {
      trackInactivity();
      state.session.isActive = true;
      state.session.lastActiveTime = currentTime;
      logEvent('TAB_VISIBLE');
    }
  }

  function trackInactivity() {
    const currentTime = Date.now();

    if (!state.session.isActive) {
      const inactiveDuration = currentTime - state.session.lastActiveTime;

      if (inactiveDuration >= state.session.inactivityThreshold) {
        state.session.inactiveDuration += inactiveDuration;
        state.session.inactivityIntervals.push({
          start: state.session.lastActiveTime,
          end: currentTime,
          duration: inactiveDuration,
        });

        logEvent('INACTIVITY_RECORDED', {
          duration: inactiveDuration / 1000,
          totalInactiveTime: state.session.inactiveDuration / 1000,
        });
      }
    } else {
      const activeDuration = currentTime - state.session.lastActiveTime;
      state.session.activeDuration += activeDuration;
      state.session.activeIntervals.push({
        start: state.session.lastActiveTime,
        end: currentTime,
        duration: activeDuration,
      });

      logEvent('ACTIVITY_RECORDED', {
        duration: activeDuration / 1000,
        totalActiveTime: state.session.activeDuration / 1000,
      });
    }
  }

  function handleBeforeUnload(event) {
    logEvent('PAGE_EXIT', {
      sessionDuration: (Date.now() - state.session.startTime) / 1000,
      exitAttempts: state.mouse.exitAttempts,
      finalPosition: state.mouse.position,
      scrollDepth: getScrollPercentage(),
      totalElementInteractions: state.elements.totalInteractions,
    });

    if (state.mouse.exitAttempts > 2) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
  }

  function initInputTracking() {
    if (!config.inputTrackingEnabled) return;

    const inputElements = document.querySelectorAll(
      'input[type="text"], input[type="search"], textarea'
    );

    inputElements.forEach(input => {
      const inputData = {
        id: input.id || input.name || 'unnamed-input',
        keystrokes: 0,
        currentText: '',
        lastModified: null,
        typingGaps: [],
      };

      state.inputs.trackedInputs.set(input, inputData);

      input.addEventListener(
        'input',
        debounce(e => handleInputChange(e, input), 100)
      );
    });
  }

  function handleInputChange(event, input) {
    const inputData = state.inputs.trackedInputs.get(input);
    const currentTime = Date.now();

    if (inputData) {
      // Update keystroke count
      inputData.keystrokes++;
      state.inputs.totalKeystrokes++;

      // Calculate typing gap if not first keystroke
      if (inputData.lastModified) {
        const gap = currentTime - inputData.lastModified;
        inputData.typingGaps.push(gap);

        // Calculate typing speed (characters per minute)
        const recentGaps = inputData.typingGaps.slice(-10);
        const avgGap =
          recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length;
        state.inputs.typingSpeed = avgGap ? 60000 / avgGap : 0;
      }

      inputData.lastModified = currentTime;
      inputData.currentText = event.target.value;

      logInputEvent(inputData);
    }
  }

  const broadcastChannel = new BroadcastChannel('tab-tracker');

  function updateTabInfo() {
    const tabInfo = {
      id: state.tab.id,
      created: parseInt(state.tab.id),
      lastUpdate: Date.now(),
      url: window.location.href,
    };
    localStorage.setItem(`tab_${state.tab.id}`, JSON.stringify(tabInfo));
  }

  function initRealTimeTabTracking() {
    state.tab.id = sessionStorage.getItem('tabId') || Date.now().toString();
    sessionStorage.setItem('tabId', state.tab.id);

    let cleanupTimeout;
    let updateInterval;

    // Handle tab visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Start cleanup countdown when hidden
        cleanupTimeout = setTimeout(() => {
          localStorage.removeItem(`tab_${state.tab.id}`);
        }, 3000);
      } else {
        // Cancel cleanup if becomes visible
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
        }
        updateTabInfo();
        updateTabCount();
      }
    });

    // Periodic cleanup of stale tabs
    setInterval(() => {
      const now = Date.now();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('tab_')) {
          try {
            const tabData = JSON.parse(localStorage.getItem(key));
            if (now - tabData.lastUpdate > 5000) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      }
    }, 5000);

    // Efficient interval management
    const startUpdateInterval = () => {
      updateInterval = setInterval(() => {
        if (document.hasFocus()) {
          updateTabInfo();
          updateTabCount();
        }
      }, 1000);
    };

    window.addEventListener('focus', () => {
      updateTabInfo();
      updateTabCount();
      startUpdateInterval();
    });

    window.addEventListener('blur', () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    });

    startUpdateInterval();

    // Return cleanup function
    return function cleanup() {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      localStorage.removeItem(`tab_${state.tab.id}`);
    };
  }

  function updateTabCount() {
    const tabs = [];

    // Get all tab IDs from sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('tab_')) {
        const tabId = key.replace('tab_', '');
        tabs.push(tabId);
      }
    }

    // Sort tabs by ID (timestamp)
    tabs.sort();

    // Get current tab's position
    const currentTabId = sessionStorage.getItem('tabId');
    state.tab.index = tabs.indexOf(currentTabId) + 1;
    state.tab.totalTabs = tabs.length;

  }

  // Handle broadcast messages
  broadcastChannel.onmessage = event => {
    const { type, tabId } = event.data;

    switch (type) {
      case 'TAB_ALIVE':
        // Store the tab ID
        sessionStorage.setItem(`tab_${tabId}`, 'active');
        updateTabCount();
        break;

      case 'TAB_CLOSED':
        // Remove the tab
        sessionStorage.removeItem(`tab_${tabId}`);
        updateTabCount();
        break;

      case 'REQUEST_TAB_COUNT':
        // Send current tab's info
        broadcastChannel.postMessage({
          type: 'TAB_ALIVE',
          tabId: sessionStorage.getItem('tabId'),
        });
        break;
    }
  };

  function handleBroadcastCleanup() {
    const tabId = sessionStorage.getItem('tabId');

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        broadcastChannel.postMessage({
          type: 'TAB_HIDDEN',
          tabId: tabId,
        });
      } else {
        broadcastChannel.postMessage({
          type: 'TAB_VISIBLE',
          tabId: tabId,
        });
      }
    });

    document.addEventListener(
      'pagehide',
      () => {
        broadcastChannel.close();
      },
      { once: true }
    );
  }

  window.addEventListener('focus', () => {
    updateTabInfo();
    updateTabCount();
  });

  window.addEventListener('blur', () => {
    updateTabInfo();
    updateTabCount();
  });

  // Add heartbeat for more accurate tracking
  const heartbeat = setInterval(() => {
    if (document.hasFocus()) {
      updateTabInfo();
      updateTabCount();
    }
  }, 500);

  // Cleanup heartbeat
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeat);
  });

  // Logging
  function logEvent(type, data = {}) {

  }

  function logInputEvent(inputData) {
    console.log({
      type: 'INPUT_CHANGE',
      timestamp: new Date().toISOString(),
      data: {
        inputId: inputData.id,
        currentLength: inputData.currentText.length,
        totalKeystrokes: inputData.keystrokes,
        typingSpeed: Math.round(state.inputs.typingSpeed),
        currentText: inputData.currentText,
        timeSinceLastType: inputData.lastModified
          ? Date.now() - inputData.lastModified
          : null,
      },
    });
  }

  function logExitAttempt(event) {
    logEvent('EXIT_ATTEMPT', {
      position: { x: event.clientX, y: event.clientY },
      type: isNearCloseButton(event.clientX, event.clientY)
        ? 'CLOSE_BUTTON'
        : 'TOP_EXIT',
      attemptCount: state.mouse.exitAttempts,
    });
  }

  let lastActivityTime = Date.now();

  function resetActivityTimer() {
    lastActivityTime = Date.now();

    // Ensure the session is marked as active
    if (!state.session.isActive) {
      state.session.isActive = true;
      state.session.lastActiveTime = Date.now();
    }
  }

  window.addEventListener('blur', () => {
    state.session.isActive = false;
    state.session.lastActiveTime = Date.now();
  });

  window.addEventListener('focus', () => {
    trackInactivity();
    state.session.isActive = true;
    state.session.lastActiveTime = Date.now();
  });

  // Initialization
  function init() {
    if (config.elementTrackingEnabled) {
      initElementTracking();
      initializeInteractionTracking();
    }
    if (config.inputTrackingEnabled) initInputTracking();

    const tabTrackingCleanup = initRealTimeTabTracking();
    handleBroadcastCleanup();

    // Efficient event listeners
    const scrollHandler = debounce(handleScroll, 16);
    const mouseMoveHandler = debounce(handleMouseMove, 16);

    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('mousemove', mouseMoveHandler, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('mousemove', resetActivityTimer);
    document.addEventListener('keypress', resetActivityTimer);
    document.addEventListener('scroll', resetActivityTimer);
    document.addEventListener('click', resetActivityTimer);

    // Log initialization
    logEvent('TRACKING_INITIALIZED', {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      pageHeight: document.documentElement.scrollHeight,
      trackedElements: Array.from(state.elements.tracked.values()).map(
        data => data.id
      ),
    });

    return function cleanup() {
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      tabTrackingCleanup();
    };
  }

  // Public API
  return {
    init,
    getState: () => ({ ...state }),
    config,
    // Add methods to manually track elements
    trackElement: function (element, id) {
      if (!element) return;
      element.dataset.track = id || 'manual-track-' + Date.now();
      initElementTracking();
    },
    untrackElement: function (element) {
      if (!element) return;
      state.elements.tracked.delete(element);
      element.classList.remove('tracked-element');
    },
  };
})();


class TabTracker {
  constructor() {
    this.tabId = this.generateTabId();

    this.isRegistered = false;

    const isCurrentProductPage = this.isProductPage();
    this.tabState = {
      productTabsCount: isCurrentProductPage ? 1 : 0,
      nonProductTabsCount: isCurrentProductPage ? 0 : 1,
      totalTabs: 1, // Start with current tab
      isProductPage: isCurrentProductPage,
    };

    try {
      this.channel = new BroadcastChannel('tab_tracker');
      this.setupChannelListeners();
    } catch (error) {
      console.warn(
        'BroadcastChannel not supported, falling back to localStorage:',
        error
      );
      this.useFallback = true;
    }

    // Store initial state before registration
    this._previousTotalTabs = this.tabState.totalTabs;

    this.registerTab();

    window.addEventListener('beforeunload', () => {
      this.unregisterTab();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleVisibilityChange();
      }
    });

    this.syncTabCounts();
  }

  handleVisibilityChange() {
    if (this.useFallback) {
      const tabs = JSON.parse(localStorage.getItem('openTabs') || '[]');
      const isRegistered = tabs.includes(this.tabId);
      console.log('Tab registration check:', {
        isRegistered,
        tabId: this.tabId,
      });

      if (!isRegistered) {
        this.registerTab();
      } else {
        this.syncTabCounts();
      }
    } else {
      this.syncTabCounts();
    }
  }

  generateTabId() {
    const id = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return id;
  }

  isProductPage() {
    const isProduct = window.location.pathname
      .toLowerCase()
      .includes('/product');
    return isProduct;
  }

  setupChannelListeners() {
    if (this.useFallback) {
      return;
    }

    this.channel.onmessage = event => {
      const { type, data, sender } = event.data;

      if (sender === this.tabId) {
        return;
      }

      switch (type) {
        case 'TAB_REGISTERED':
        case 'TAB_UNREGISTERED':
          this.syncTabCounts();
          break;
        case 'REQUEST_SYNC':
          if (document.visibilityState === 'visible') {
            this.broadcastState();
          }
          break;
      }
    };
  }

  registerTab() {

    if (this.useFallback) {
      this.fallbackRegisterTab();
    } else {
      const message = {
        type: 'TAB_REGISTERED',
        data: {
          isProductPage: this.isProductPage(),
          timestamp: Date.now(),
        },
        sender: this.tabId,
      };
      this.channel.postMessage(message);
    }
  }

  unregisterTab() {
    // Store current count before unregistering
    this._previousTotalTabs = this.tabState.totalTabs;
    if (this.useFallback) {
      localStorage.setItem(
        'previousTotalTabs',
        this.tabState.totalTabs.toString()
      );
    }

    if (this.useFallback) {
      this.fallbackUnregisterTab();
      return;
    }

    const message = {
      type: 'TAB_UNREGISTERED',
      sender: this.tabId,
    };
    this.channel.postMessage(message);
  }

  syncTabCounts() {
    if (this.useFallback) {
      this.fallbackSyncCounts();
      return;
    }

    const message = {
      type: 'REQUEST_SYNC',
      sender: this.tabId,
    };
    this.channel.postMessage(message);
  }

  broadcastState() {
    if (this.useFallback) {
      return;
    }

    const message = {
      type: 'TAB_STATE',
      data: this.tabState,
      sender: this.tabId,
    };
    this.channel.postMessage(message);
  }

  fallbackRegisterTab() {
    try {
      const tabs = JSON.parse(localStorage.getItem('openTabs') || '[]');

      if (!tabs.includes(this.tabId)) {
        tabs.push(this.tabId);
        localStorage.setItem('openTabs', JSON.stringify(tabs));
        const tabData = {
          isProductPage: this.isProductPage(),
          timestamp: Date.now(),
        };
        localStorage.setItem(`tab_${this.tabId}`, JSON.stringify(tabData));
        console.log('Tab registered in localStorage:', {
          tabId: this.tabId,
          data: tabData,
        });

        if (this.isProductPage()) {
          this.tabState.productTabsCount++;
        } else {
          this.tabState.nonProductTabsCount++;
        }
        this.tabState.totalTabs = tabs.length;
        this.isRegistered = true;
      } else {
      }
      this.fallbackSyncCounts();
    } catch (error) {
      console.error('Error in fallback tab registration:', error);
    }
  } 

  fallbackUnregisterTab() {
    try {
      const tabs = JSON.parse(localStorage.getItem('openTabs') || '[]');

      const filteredTabs = tabs.filter(id => id !== this.tabId);
      localStorage.setItem('openTabs', JSON.stringify(filteredTabs));
      localStorage.removeItem(`tab_${this.tabId}`);

      // Modified: Update local state immediately
      if (this.isProductPage()) {
        this.tabState.productTabsCount = Math.max(
          0,
          this.tabState.productTabsCount - 1
        );
      } else {
        this.tabState.nonProductTabsCount = Math.max(
          0,
          this.tabState.nonProductTabsCount - 1
        );
      }
      this.tabState.totalTabs = Math.max(0, this.tabState.totalTabs - 1);

    } catch (error) {
      console.error('Error in fallback tab unregistration:', error);
    }
  }

  fallbackSyncCounts() {
    try {
      const tabs = JSON.parse(localStorage.getItem('openTabs') || '[]');

      let productTabs = 0;
      let nonProductTabs = 0;

      tabs.forEach(tabId => {
        const tabData = JSON.parse(localStorage.getItem(`tab_${tabId}`));

        if (tabData) {
          if (tabData.isProductPage) {
            productTabs++;
          } else {
            nonProductTabs++;
          }
        }
      });

      const previousState = { ...this.tabState };
      this.tabState.productTabsCount = productTabs;
      this.tabState.nonProductTabsCount = nonProductTabs;
      this.tabState.totalTabs = productTabs + nonProductTabs;

      // Validate counts
      if (
        this.tabState.totalTabs !==
        this.tabState.productTabsCount + this.tabState.nonProductTabsCount
      ) {
        console.warn('Tab count mismatch detected, correcting totalTabs');
        this.tabState.totalTabs =
          this.tabState.productTabsCount + this.tabState.nonProductTabsCount;
      }

      console.log('Tab count sync complete:', {
        previous: previousState,
        current: this.tabState,
      });
    } catch (error) {
      console.error('Error in fallback sync:', error);
    }
  }

  getTabCounts() {
    // Modified: Ensure sync before returning
    this.fallbackSyncCounts();

    const counts = {
      productTabs: this.tabState.productTabsCount,
      nonProductTabs: this.tabState.nonProductTabsCount,
      totalTabs: this.tabState.totalTabs,
    };
    return counts;
  }

  get previousTotalTabs() {
    if (this.useFallback) {
      try {
        const count = parseInt(
          localStorage.getItem('previousTotalTabs') || '0'
        );
        return count;
      } catch (error) {
        console.error('Error getting previous tab count:', error);
        return 0;
      }
    }
    console.log(
      'Retrieved previous total tabs from memory:',
      this._previousTotalTabs || 0
    );
    return this._previousTotalTabs || 0;
  }

  isLastProductTab() {
    // Modified: Ensure sync before checking
    this.fallbackSyncCounts();
    const isLast = this.tabState.productTabsCount === 1 && this.isProductPage();
    return isLast;
  }

  isLastTab() {
    // Modified: Ensure sync before checking
    this.fallbackSyncCounts();
    const isLast = this.tabState.totalTabs === 1;
    return isLast;
  }
}

class PageTracker {
  constructor() {
    // Initialize collections properly
    this.sentPageLoads = new Set();
    this.sentPageLoadsTimestamp = new Map();

    // Basic state
    this.currentUrl = window.location.href;
    this.wsConnected = false;
    this.hasInitializedChat = false;
    this.pageLoadQueue = [];
    this.pageLoadDebounceTime = 2000;

    // Initialize monitoring
    this.monitorWebSocketState();
    this.setupNavigationTracking();
    this.setupPopStateHandling();

    this.recentPageLoads = new Map();
    this.DEDUPLICATION_WINDOW = 10 * 1000;

    this.debounce = (
      typeof _ !== 'undefined' ? _.debounce : this.createDebounce()
    ).bind(this);

    // Add error handling wrapper for navigation
    this.handleNavigation = this.handleNavigation.bind(this);

    // Send initial page load when document is ready
    if (document.readyState === 'complete') {
      this.handleInitialPageLoad();
    } else {
      window.addEventListener('load', () => this.handleInitialPageLoad());
    }

    // Handle URL changes via browser back/forward
    window.addEventListener('popstate', () => this.handleUrlChange());

    // Handle history.pushState/replaceState
    this.wrapHistoryMethods();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Only fetch if there's been actual navigation
        const currentUrl = window.location.href;
        if (this.currentUrl !== currentUrl) {
          this.queuePageLoadEvent();
        }
      }
    });

    this.tabTracker = new TabTracker();

    this.exitConfig = {
      threshold: 80,
      debounceTime: 150, // Increased for better reliability
      closeTransitionTime: 300,
      mobileDisabled: true,
    };

    // Add chat state management
    this.chatState = {
      isOpen: false,
      isAnimating: false,
      hasAutoOpened: false,
      forceClosed: false,
    };

    this.navigationState = {
      history: [],
      isNavigating: false,
      lastNavigationTime: Date.now(),
      navigationTimeout: null,
      forwardStack: [window.location.href],
      currentPosition: 0,
      lastPageUrl: null,
      navigationCount: 0,
      pageEntryTime: Date.now(),
    };

    this.tabState = {
      productTabsCount: 0,
      nonProductTabsCount: 0,
      previousTabsCount: 0,
      lastTabChange: Date.now(),
    };

    this.activityState = {
      lastActivityTime: Date.now(),
      isTracking: false,
      activityEvents: new Set(),
      activities: ['mousemove', 'click', 'scroll', 'keypress'], // Add this line
    };

    const browserHistory = window.history.state || {};
    this.navigationState.hasForwardHistory = !!browserHistory.hasForward;

    // Initialize chat state
    this.initializeChatState();

    // Set up observers and event listeners
    this.setupChatVisibilityTracking();

    this.loadChatState();

    this.sessionIdPromise = null;
    this.sessionIdResolve = null;
    this.pendingNewChats = [];

    this.newChatInProgress = false;
    this.pageLoadDebounceTimer = null;
    this.DEBOUNCE_DELAY = 1000;

    // Create initial session promise
    this.createSessionPromise();

    this.isSessionReady = false;
    // Queue to store page load events before session is ready
    this.pendingPageLoadEvents = [];
    // Initialize session readiness monitoring
    this.monitorSessionReadiness();

    this.lastNavigation = {
      type: 'unknown',
      timestamp: Date.now(),
      url: window.location.href,
    };

    // Track initial load type
    this.initialLoadType =
      performance.getEntriesByType('navigation')[0]?.type || 'unknown';
  }

  isMobileDevice() {
    return (
      window.innerWidth <= 768 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
      'ontouchstart' in window ||
      navigator.msMaxTouchPoints
    );
  }

  initializeChatState() {
    // Check initial chat state
    const chatWindow = document.querySelector('.Darban_search_open_window');
    this.chatState.isOpen =
      chatWindow?.style.display === 'block' ||
      chatWindow?.classList.contains('active');
  }

  setupChatVisibilityTracking() {
    // Track chat open/close
    document.querySelector('.Darban_search')?.addEventListener('click', () => {
      this.chatState.isOpen = true;
      // Process any queued events when chat opens
      this.processPageLoadQueue();
    });

    document
      .querySelector('#minimise_btn .cht_close')
      ?.addEventListener('click', () => {
        this.chatState.isOpen = false;
      });

    // Create mutation observer for chat window visibility changes
    const chatObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.target.classList.contains('Darban_search_open_window')) {
          const isVisible =
            mutation.target.style.display === 'block' ||
            mutation.target.classList.contains('active');
          this.chatState.isOpen = isVisible;

          if (isVisible) {
            // Process queued events when chat becomes visible
            this.processPageLoadQueue();
          }
        }
      });
    });

    // Observe chat window
    const chatWindow = document.querySelector('.Darban_search_open_window');
    if (chatWindow) {
      chatObserver.observe(chatWindow, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }
  }

  monitorWebSocketState() {
    // Monitor WebSocket readiness
    const checkWsState = () => {
      const newWsState = wsHandler?.ws?.readyState === WebSocket.OPEN;

      if (newWsState && !this.wsConnected) {
        this.wsConnected = true;
        this.processPageLoadQueue();
      }

      if (!newWsState && this.wsConnected) {
        console.log('PageTracker: WebSocket disconnected');
        this.wsConnected = false;
      }
    };

    // Check regularly
    setInterval(checkWsState, 1000);

    // Monitor WebSocket events
    wsHandler.ws?.addEventListener('open', () => {
      this.wsConnected = true;
      this.processPageLoadQueue();
    });

    wsHandler.ws?.addEventListener('close', () => {
      this.wsConnected = false;
    });
  }

  handleInitialPageLoad() {
    // Check if this is a refresh
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isRefresh = navEntry?.type === 'reload';

    if (isRefresh) {
      return;
    }

    if (sessionId) {
      console.log('PageTracker: Handling initial page load');
      this.queuePageLoadEvent();
    } else {
      console.log('PageTracker: Waiting for session ID');
      // Wait for session ID to be set
      const checkInterval = setInterval(() => {
        if (sessionId) {
          this.queuePageLoadEvent();
          clearInterval(checkInterval);
        }
      }, 100);
    }
  }

  wrapHistoryMethods() {
    try {
      const originalPushState = history.pushState;
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.handleNavigation();
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        this.handleNavigation();
      };
    } catch (error) {
      console.error('PageTracker: Error wrapping history methods:', error);
    }
  }

  setupNavigationTracking() {
    // Watch for programmatic navigation
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'navigation') {
          this.handleUrlChange();
        }
      }
    });

    observer.observe({ entryTypes: ['navigation'] });
  }

  setupPopStateHandling() {
    window.addEventListener('popstate', () => {
      this.handleUrlChange();
    });
  }

  handleUrlChange() {
    const newUrl = window.location.href;
    if (this.currentUrl !== newUrl) {
      console.log('PageTracker: URL changed', {
        from: this.currentUrl,
        to: newUrl,
      });

      this.currentUrl = newUrl;

      if (sessionId && this.wsConnected) {
        // Clear tracking of sent page loads on URL change
        this.sentPageLoads.clear();
        this.sentPageLoadsTimestamp.clear();

        // Queue the page load event
        this.queuePageLoadEvent();
      } else {
        console.log(
          'PageTracker: Cannot send page load - no session or connection'
        );
        // Queue for later when connection is available
        this.queuePageLoadEvent();
      }
    }
  }

  // Session handling
  setupSessionListener() {
    wsHandler.ws.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.currentAction === 'zoyaNewChat' && data.sessionId) {
        // Only handle if no active session
        if (!sessionId) {
          sessionId = data.sessionId;
          if (!this.hasInitializedChat) {
            this.hasInitializedChat = true;
            this.queuePageLoadEvent();
          }
        }
      }
    });
  }

  // Page type detection
  getPageType() {
    const path = window.location.pathname.toLowerCase();

    const typeDetectors = [
      { type: 'product', patterns: ['/product', '/details', '.aspx'] },
      {
        type: 'category',
        patterns: [
          '/collection',
          '/category',
          '/salwar-kameez',
          '/bridal',
          '/lehengas',
        ],
      },
      {
        type: 'account',
        patterns: [
          '/my-account',
          '/account',
          '/profile',
          '/login',
          '/register',
        ],
      },
      {
        type: 'checkout',
        patterns: ['/checkout', '/cart', '/payment', '/shipping'],
      },
      { type: 'wishlist', patterns: ['/wishlist', '/shortlist', '/favorite'] },
    ];

    // Check against patterns
    for (const detector of typeDetectors) {
      if (detector.patterns.some(pattern => path.includes(pattern))) {
        return detector.type;
      }
    }

    // Special case for home page
    if (path === '/' || path === '/in/' || path === '/in') {
      return 'home';
    }

    return 'other';
  }

  // Metadata extraction
  getPageMetadata() {
    const url = new URL(window.location.href);
    const metadata = {
      pageType: this.getPageType(),
      url: url.href,
      referrer: document.referrer,
      domain: url.hostname,
      path: url.pathname,
      queryParams: Object.fromEntries(url.searchParams),
    };

    // Dynamically extract additional metadata based on page type
    switch (metadata.pageType) {
      case 'product':
        metadata.productDetails = this.extractProductDetails();
        break;
      case 'category':
        metadata.categoryDetails = this.extractCategoryDetails();
        break;
      case 'account':
        metadata.accountAction = url.searchParams.get('action') || 'view';
        break;
      case 'checkout':
        metadata.checkoutStage = this.extractCheckoutStage();
        break;
    }

    return metadata;
  }

  extractProductDetails() {
    return {
      productCode:
        $('.prod_code').html()?.trim() ||
        $('[data-product-code]').attr('data-product-code') ||
        new URL(window.location.href).searchParams.get('pid') ||
        '',
      productName:
        $('.product-name').text()?.trim() ||
        $('h1.product-title').text()?.trim() ||
        '',
      price: $('.product-price').text()?.trim() || '',
      category: $('.breadcrumb .category').text()?.trim() || '',
    };
  }

  extractCategoryDetails() {
    return {
      categoryName:
        $('.category-name').text()?.trim() ||
        $('h1.page-title').text()?.trim() ||
        this.extractCategoryFromPath(),
      productsCount:
        $('.product-item').length || $('.product-grid .product').length || 0,
      filters: this.extractActiveFilters(),
    };
  }

  extractCategoryFromPath() {
    const path = window.location.pathname;
    // Extract category name from URL segments
    const segments = path
      .split('/')
      .filter(segment => segment && segment !== 'in');
    return segments[segments.length - 1].replace(/-/g, ' ');
  }

  extractActiveFilters() {
    const filters = {};
    const searchParams = new URLSearchParams(window.location.search);

    ['color', 'size', 'price', 'brand', 'sort'].forEach(filterType => {
      const filterValue = searchParams.get(filterType);
      if (filterValue) {
        filters[filterType] = filterValue;
      }
    });
    return filters;
  }

  extractCheckoutStage() {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    if (path.includes('/cart')) return 'cart';
    if (path.includes('/shipping')) return 'shipping';
    if (path.includes('/payment')) return 'payment';
    if (searchParams.get('stage')) return searchParams.get('stage');

    return 'unknown';
  }

  createSessionPromise() {
    this.sessionIdPromise = new Promise(resolve => {
      this.sessionIdResolve = resolve;
    });
  }

  async waitForSession() {
    return this.sessionIdPromise;
  }

  monitorSessionReadiness() {
    const checkSessionInterval = setInterval(() => {
      if (sessionId) {
        this.isSessionReady = true;
        if (this.sessionIdResolve) {
          this.sessionIdResolve(sessionId);
        }
        clearInterval(checkSessionInterval);

        // Process any pending new chat requests
        this.processPendingNewChats();
      }
    }, 100);

    // Prevent infinite waiting
    setTimeout(() => {
      clearInterval(checkSessionInterval);
      if (!this.isSessionReady) {
        console.warn('Session initialization timed out');
        // Create new session promise for next attempt
        this.createSessionPromise();
      }
    }, 5000);
  }

  async processPendingNewChats() {
    while (this.pendingNewChats.length > 0) {
      const chatRequest = this.pendingNewChats.shift();
      await this.handleNewChatRequest(chatRequest);
    }
  }

  async handleNewChatRequest(options = {}) {    
    if (this.newChatInProgress) {
      console.log('New chat already in progress, skipping duplicate request');
      return;
    }

    this.newChatInProgress = true;

    try {
      await this.waitForSession();

      if (wsHandler?.ws?.readyState === WebSocket.OPEN) {
        // Clear any existing debounce timer
        if (this.pageLoadDebounceTimer) {
          clearTimeout(this.pageLoadDebounceTimer);
        }

        // Debounce the page load event
        this.pageLoadDebounceTimer = setTimeout(() => {
          this.queuePageLoadEvent(true, null, {
            suppressTypingAnimation: options.suppressTypingAnimation,
            isNewChat: true,
          });

          this.processPageLoadQueue({
            suppressTypingAnimation: options.suppressTypingAnimation,
            isNewChat: true,
          });
        }, this.DEBOUNCE_DELAY);
      } else {
        console.log('WebSocket not ready, queueing new chat request');
        this.pendingNewChats.push(options);
      }
    } catch (error) {
      console.error('Error handling new chat request:', error);
      // Create new session promise for next attempt
      this.createSessionPromise();
    } finally {
      this.newChatInProgress = false;
    }
  }

  processPendingPageLoadEvents() {
    while (this.pendingPageLoadEvents.length > 0) {
      const event = this.pendingPageLoadEvents.shift();
      this.queuePageLoadEvent(...event);
    }
  }

  // Event sending
  queuePageLoadEvent(forceLoad = false, context = null, options = {}) {
    const { suppressTypingAnimation = false, isNewChat = false } = options;

    // If session is not ready, store the event for later
    if (!sessionId) {
      console.log('Session not ready. Storing page load event for later.');
      this.pendingPageLoadEvents.push([forceLoad, context, options]);
      return;
    }

    const now = Date.now();
    const metadata = {
      pageType: this.getPageType(),
      url: window.location.href,
      referrer: document.referrer,
      domain: window.location.hostname,
      path: window.location.pathname,
      queryParams: Object.fromEntries(
        new URLSearchParams(window.location.search)
      ),
      navigationType: forceLoad ? 'newChat' : 'navigation',
      deviceInteraction: {
        type: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
          ? 'mobile'
          : /iPad|Android|Touch/i.test(navigator.userAgent) &&
            window.innerWidth > 768
          ? 'tablet'
          : 'desktop',
        browser: {
          vendor: navigator.vendor,
          platform: navigator.platform,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine,
        },
        screen: {
          width: window.innerWidth,
          height: window.innerHeight,
          pixelRatio: window.devicePixelRatio,
          orientation: window.screen.orientation?.type,
        },
      },
      ...(context && { exitIntentData: context }),
      isNewChat: isNewChat,
    };

    const pageLoadEvent = {
      action: 'sendMessageTest',
      subAction: 'pageLoad',
      userMessage: '',
      sessionId: sessionId,
      userId: userid,
      clientId: clientId,
      currentPage: metadata.url,
      metadata,
      isNewChat: isNewChat || !this.hasInitializedChat,
      timestamp: now,
      isExitIntent: !!context?.exitIntent,
    };

    // Deduplication check
    const pageKey = `${sessionId}_${metadata.url}${
      context?.exitIntent ? '_exit' : ''
    }${isNewChat ? '_newChat' : ''}`;

    if (
      this.pageLoadQueue.some(
        event =>
          event.sessionId === sessionId &&
          event.metadata?.url === metadata.url &&
          event.isNewChat === isNewChat &&
          now - event.timestamp < 2000
      )
    ) {
      console.log('Duplicate page load event detected, skipping');
      return;
    }

    if (
      !this.sentPageLoadsTimestamp.has(pageKey) ||
      now - this.sentPageLoadsTimestamp.get(pageKey) > 300000
    ) {
      this.pageLoadQueue.push(pageLoadEvent);
    }

    if ((this.chatState.isOpen || isNewChat) && this.wsConnected) {
      if (this.pageLoadDebounceTimer) {
        clearTimeout(this.pageLoadDebounceTimer);
      }

      this.pageLoadDebounceTimer = setTimeout(() => {
        this.processPageLoadQueue({ suppressTypingAnimation, isNewChat });
      }, 500);
    }
  }

  async processPageLoadQueue(options = {}) {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    const { suppressTypingAnimation = false, isNewChat = false } = options;

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const isReadyToProcess =
        (this.chatState.isOpen || isNewChat) &&
        wsHandler?.ws?.readyState === WebSocket.OPEN &&
        sessionId;

      if (!isReadyToProcess) {
        return;
      }

      while (this.pageLoadQueue.length > 0) {
        const event = this.pageLoadQueue.shift();
        const pageKey = `${sessionId}_${event.metadata.url}${
          event.isNewChat ? '_newChat' : ''
        }`;
        const now = Date.now();

        // Check if recently processed
        if (this.recentlyProcessedEvents?.has(pageKey)) {
          console.log('Event recently processed, skipping:', pageKey);
          continue;
        }

        // Only process if not sent recently or if forced
        if (
          !this.sentPageLoads.has(pageKey) ||
          now - this.sentPageLoadsTimestamp.get(pageKey) > 10000 ||
          event.isNewChat
        ) {
          // Handle UI updates
          const isPastChatLoading = $('.typing-indicator-message').length > 0;
          if (!isPastChatLoading) {
            // Remove existing buttons
            await new Promise(resolve => {
              const $buttons = $(
                '.button-animation-container, .msgbuttons, .default-que.two.card_div.msgbuttons'
              );
              if ($buttons.length) {
                $buttons.fadeOut(300, function () {
                  $(this).remove();
                  resolve();
                });
              } else {
                resolve();
              }
            });

            // Remove existing typing indicators
            $('.typing-indicator-message').remove();

            // Show typing animation if needed
            if (
              !suppressTypingAnimation &&
              !$('.default_screen').is(':visible')
            ) {
              const typingHtml = `
              <div class="answers_div typing-indicator-message" style="opacity: 0; transform: translateY(10px);">
                <div class="ans_text">
                  <span class="pr-2">
                    <img width="27" src="/Images/zoya_chat_icon.png" alt="zoya_chat_icon" />
                  </span>
                  <div class="typing-indicator">
                    <span class="jump1"></span>
                    <span class="jump2"></span>
                    <span class="jump3"></span>
                  </div>
                </div>
              </div>
            `;

              const $typingIndicator = $(typingHtml).appendTo('.ques_with_ans');
              await new Promise(resolve => {
                requestAnimationFrame(() => {
                  $typingIndicator.css({
                    transition: 'all 0.3s ease-out',
                    opacity: '1',
                    transform: 'translateY(0)',
                  });
                  setTimeout(resolve, 300);
                });
              });

              smoothStreamScroll();
            }

            disableChatInput();
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Send the event
          wsHandler.send(event);

          // Update tracking
          this.sentPageLoads.add(pageKey);
          this.sentPageLoadsTimestamp.set(pageKey, now);
          this.recentlyProcessedEvents =
            this.recentlyProcessedEvents || new Set();
          this.recentlyProcessedEvents.add(pageKey);

          if (!this.hasInitializedChat) {
            this.hasInitializedChat = true;
          }

          // Clear tracked event after delay
          setTimeout(() => {
            this.recentlyProcessedEvents.delete(pageKey);
          }, 2000);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  trackUserActivity() {
    console.group('👁️ Activity Tracking Setup');

    try {
      if (!this.activityState.isTracking) {
        // Define activities if not already defined
        const activities = this.activityState.activities || [
          'mousemove',
          'click',
          'scroll',
          'keypress',
        ];

        activities.forEach(activity => {
          // Remove any existing listeners first
          document.removeEventListener(activity, this.activityHandler);

          // Create a bound handler
          this.activityHandler = () => {
            this.activityState.lastActivityTime = Date.now();
            this.activityState.activityEvents.add(activity);
          };

          // Add the new listener
          document.addEventListener(activity, this.activityHandler);
        });

        this.activityState.isTracking = true;
      } else {
      }
    } catch (error) {
      console.error('Error initializing activity tracking:', error);
      // Fallback to basic mousemove tracking if something goes wrong
      document.addEventListener('mousemove', () => {
        this.activityState.lastActivityTime = Date.now();
      });
    }

    console.groupEnd();
  }

  cleanupActivityTracking() {
    if (this.activityState.isTracking && this.activityState.activities) {
      this.activityState.activities.forEach(activity => {
        document.removeEventListener(activity, this.activityHandler);
      });
      this.activityState.isTracking = false;
      this.activityState.activityEvents.clear();
    }
  }

  // Navigation tracking
  initNavigationTracking() {

    // Handle back/forward navigation
    window.addEventListener('popstate', () => {
      this.navigationState.currentPosition += window.history.state?.forward
        ? 1
        : -1;
      this.handleNavigation();
    });

    // Handle pushState
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.navigationState.forwardStack.push(args[2]); // URL is typically the third argument
      this.navigationState.currentPosition++;
      this.handleNavigation();
    };

    // Handle replaceState
    const originalReplaceState = history.replaceState;
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      if (this.navigationState.forwardStack.length > 0) {
        this.navigationState.forwardStack[
          this.navigationState.currentPosition
        ] = args[2];
      }
      this.handleNavigation();
    };
  }

  handleNavigation() {
    try {
      const newUrl = window.location.href;
      const navEntry = performance.getEntriesByType('navigation')[0];
      const isRefresh = navEntry?.type === 'reload';

      console.log('PageTracker: Navigation detected', {
        from: this.currentUrl,
        to: newUrl,
        type: navEntry?.type || 'unknown',
      });

      if (isRefresh) {
        return;
      }

      if (this.currentUrl !== newUrl) {
        this.updateNavigationState(newUrl);
        this.currentUrl = newUrl;
        if (sessionId) {
          // Safely clear collections
          if (
            this.sentPageLoads &&
            typeof this.sentPageLoads.clear === 'function'
          ) {
            this.sentPageLoads.clear();
          } else {
            this.sentPageLoads = new Set();
          }

          if (
            this.sentPageLoadsTimestamp &&
            typeof this.sentPageLoadsTimestamp.clear === 'function'
          ) {
            this.sentPageLoadsTimestamp.clear();
          } else {
            this.sentPageLoadsTimestamp = new Map();
          }

          this.queuePageLoadEvent();
        } else {
        }
      }
    } catch (error) {
      console.error('PageTracker: Error handling navigation:', error);
      // Reinitialize collections if they're undefined
      this.sentPageLoads = this.sentPageLoads || new Set();
      this.sentPageLoadsTimestamp = this.sentPageLoadsTimestamp || new Map();
    }
  }

  // Chat state management
  loadChatState() {
    this.chatState.forceClosed =
      sessionStorage.getItem('exitIntentChatClosed') === 'true';
    if (this.chatState.forceClosed) {
      this.hideChat();
    }
  }

  // Fallback debounce implementation
  createDebounce() {
    return function (func, wait) {
      let timeout;
      const context = this;

      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func.apply(context, args);
        };

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    };
  }

  // Exit intent functionality

  initExitIntent() {
    // Initial state logging

    const initialState = {
      isMobile: this.isMobileDevice(),
      windowWidth: window.innerWidth,
      userAgent: navigator.userAgent,
      chatState: this.chatState,
      sessionReady: !!sessionId,
      wsConnected: this.wsConnected,
    };


    // Early exit for mobile devices
    if (initialState.isMobile) {
      return;
    }

    try {
      this.trackUserActivity();
      this.trackTabs();
    } catch (error) {
      console.error('Exit Intent: Error initializing tracking:', error);
    }

    // Setup navigation tracking
    this.setupExitIntentNavigation();

    // Handle mouse movement with improved debouncing
    const handleMouseMove = this.debounce(async e => {
      // Check current state
      const currentState = {
        mousePosition: { x: e.clientX, y: e.clientY },
        wsReady: wsHandler?.ws?.readyState === WebSocket.OPEN,
        sessionExists: !!sessionId,
        chatState: this.chatState,
        tabState: this.tabTracker.getTabCounts(),
      };

      // Log state only occasionally to avoid console spam
      if (!this.lastStateLog || Date.now() - this.lastStateLog > 5000) {
        this.lastStateLog = Date.now();
      }

      // Check WebSocket and session
      if (!currentState.wsReady || !currentState.sessionExists) {
        return;
      }

      // Evaluate exit conditions
      if (this.shouldTriggerExitIntent(e)) {
        await this.handleExitIntent(e);
      }
    }, this.exitConfig.debounceTime);

    // Attach event listeners
    document.addEventListener('mousemove', handleMouseMove);

    // Cleanup handler
    window.addEventListener('unload', () => {
      document.removeEventListener('mousemove', handleMouseMove);
    });

    this.bindChatEvents();
  }

  setupExitIntentNavigation() {
    // Track navigation state changes
    window.addEventListener('popstate', () => {
      this.navigationState.isNavigating = true;
      this.navigationState.lastNavigationTime = Date.now();

      if (this.navigationState.navigationTimeout) {
        clearTimeout(this.navigationState.navigationTimeout);
      }

      this.navigationState.navigationTimeout = setTimeout(() => {
        this.navigationState.isNavigating = false;
      }, 500);
    });

    // Track history method calls
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.navigationState.history.push(window.location.href);
      this.navigationState.hasForwardHistory = true;
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.navigationState.hasForwardHistory = true;
    };
  }

  shouldTriggerExitIntent(event) {
    const conditions = {
      notAnimating: !this.chatState.isAnimating,
      mouseNearTop: event.clientY < this.exitConfig.threshold,
      notForceClosed: !this.chatState.forceClosed,
      isDesktop: window.innerWidth > 768,
      chatClosed: !this.chatState.isOpen,
      isValidPage: this.isActualExit(event),
    };

    // Check for header/search elements
    const hoveredElement = document.elementFromPoint(
      event.clientX,
      event.clientY
    );
    const isHeaderElement = hoveredElement?.closest(
      'header, .header, .search-span, .searchbox, .menu, .menu-section'
    );
    const isSearchElement = hoveredElement?.closest(
      '.ais-SearchBox, .ais-SearchBox-input, .ais-SearchBox-form'
    );

    // Log conditions occasionally to avoid spam
    if (!this.lastConditionsLog || Date.now() - this.lastConditionsLog > 5000) {
      console.log('Exit Intent: Checking conditions:', {
        ...conditions,
        isHeaderElement: !!isHeaderElement,
        isSearchElement: !!isSearchElement,
      });
      this.lastConditionsLog = Date.now();
    }

    return (
      conditions.notAnimating &&
      conditions.mouseNearTop &&
      conditions.notForceClosed &&
      conditions.isDesktop &&
      conditions.chatClosed &&
      conditions.isValidPage &&
      !isHeaderElement &&
      !isSearchElement
    );
  }

  async handleExitIntent(event) {

    try {
      this.openChat(true);

      // Prepare tracking data
      const trackingData = {
        action: 'trackInteraction',
        subAction: 'exitIntent',
        sessionId: sessionId,
        userId: userid,
        clientId: clientId,
        currentPage: window.location.href,
        metadata: {
          mousePosition: {
            x: event.clientX,
            y: event.clientY,
          },
          timestamp: Date.now(),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          triggerType: 'final_exit',
          navigationState: {
            hasHistory: this.navigationState.history.length > 0,
            hasForwardHistory: this.navigationState.hasForwardHistory,
            lastNavigation: this.navigationState.lastNavigationTime,
          },
          pageContext: {
            type: this.getPageType(),
            timeOnPage: Date.now() - this.navigationState.pageEntryTime,
            url: window.location.href,
            referrer: document.referrer,
          },
        },
      };

      wsHandler.send(trackingData);
    } catch (error) {
    }
  }

  isActualExit(event) {
    console.group('🕵️ Actual Exit Detection');
    const currentUrl = window.location.href;
    const isProductPage = currentUrl.includes('/product/');
    const isLandingPage = this.isLandingPage(currentUrl);
    const isNonProductPage = !isProductPage && !isLandingPage;

    console.log('Page Type:', {
      isProductPage,
      isLandingPage,
      isNonProductPage,
      currentUrl,
    });

    const tabCounts = this.tabTracker.getTabCounts();

    // Don't trigger if multiple tabs are open
    if (tabCounts.totalTabs > 1) {
      console.warn('Multiple tabs open - Exit blocked');
      console.groupEnd();
      return false;
    }

    // Handle tab reduction trigger
    const previousTotalTabs = this.tabTracker.previousTotalTabs || 0;
    if (previousTotalTabs > 1 && tabCounts.totalTabs === 1) {
      console.groupEnd();
      return true;
    }

    // Product page specific logic
    if (isProductPage) {
      const timeOnPage = Date.now() - this.navigationState.pageEntryTime;
      const timeSinceLastActivity =
        Date.now() - this.activityState.lastActivityTime;

      console.log('Time Tracking:', {
        timeOnPage: `${timeOnPage}ms`,
        timeSinceLastActivity: `${timeSinceLastActivity}ms`,
      });

      // First condition: 15 second wait
      if (timeOnPage < 15000) {
        console.warn('Too early on product page');
        console.groupEnd();
        return false;
      }

      // Second condition: Activity timer
      if (timeSinceLastActivity > 10000) {
        console.groupEnd();
        return true;
      }

      // Third condition: Mouse coordinate check
      if (event && event.clientY < this.exitConfig.threshold) {
        if (this.tabTracker.isLastProductTab()) {
          console.groupEnd();
          return true;
        }
      }
    }

    // Non-product page logic
    if (isNonProductPage || isLandingPage) {
      const timeOnPage = Date.now() - this.navigationState.pageEntryTime;

      if (timeOnPage < 30000) {
        console.warn('Too early on non-product page');
        console.groupEnd();
        return false;
      }

      if (event && event.clientY < this.exitConfig.threshold) {
        console.groupEnd();
        return true;
      }
    }

    console.groupEnd();
    return false;
  }

  isLandingPage(url) {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    return (
      pathSegments.length <= 1 && /^\/[a-z]{2,3}\/?$/.test(urlObj.pathname)
    );
  }

  trackTabs() {
    // Track tab visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateTabCounts();
      }
    });

    // Track tab closes
    window.addEventListener('beforeunload', () => {
      this.tabState.previousTabsCount =
        this.tabState.productTabsCount + this.tabState.nonProductTabsCount;
    });
  }

  updateTabCounts() {
    const currentUrl = window.location.href;
    const isProductPage = currentUrl.includes('/product/');

    this._previousTotalTabs = this.tabState.totalTabs;
    if (this.useFallback) {
      localStorage.setItem(
        'previousTotalTabs',
        this.tabState.totalTabs.toString()
      );
    }

    this.tabState.previousTabsCount =
      this.tabState.productTabsCount + this.tabState.nonProductTabsCount;

    if (isProductPage) {
      this.tabState.productTabsCount++;
    } else {
      this.tabState.nonProductTabsCount++;
    }

    this.tabState.lastTabChange = Date.now();
  }

  isLikelyFinalPage = function () {
    const path = window.location.pathname.toLowerCase();
    const searchParams = new URLSearchParams(window.location.search);

    // Known final pages
    const finalPages = [
      '/checkout/cart',
      '/order/confirmation',
      '/checkout/complete',
      '/payment/success',
    ];

    // Direct matches for final pages
    if (finalPages.some(page => path.includes(page))) {
      return true;
    }

    // Cart abandonment patterns
    const isCart = path.includes('/cart');
    const comesFromCheckout = document.referrer.includes('/checkout');
    if (isCart && comesFromCheckout) {
      return true;
    }

    // Product detail page engagement
    const isProductPage =
      path.includes('/product') || path.includes('/details');
    if (isProductPage) {
      const timeOnPage = Date.now() - this.navigationState.pageEntryTime;
      const hasLongEngagement = timeOnPage > 30000; // 30 seconds
      const noRecentClicks = this.getTimeSinceLastClick() > 30000;

      if (hasLongEngagement && noRecentClicks) {
        return true;
      }
    }

    // Category page with filters applied
    const isCategoryPage =
      path.includes('/collection') || path.includes('/category');
    if (isCategoryPage) {
      const hasFilters =
        searchParams.has('filter') ||
        searchParams.has('sort') ||
        searchParams.has('price');
      const isDeepScroll = this.getScrollDepth() > 70;

      if (hasFilters && isDeepScroll) {
        return true;
      }
    }

    // Search results with no interaction
    const isSearchPage = path.includes('/search');
    if (isSearchPage && searchParams.has('q')) {
      const noSearchInteraction = this.getTimeSinceLastClick() > 60000;
      const hasSearchResults =
        document.querySelectorAll('.product-card').length > 0;

      if (noSearchInteraction && hasSearchResults) {
        return true;
      }
    }

    // Last page in navigation chain
    const isLastPage =
      this.navigationState.currentPosition ===
      this.navigationState.forwardStack.length - 1;
    const hasSpentTime =
      Date.now() - this.navigationState.pageEntryTime > 45000;

    if (isLastPage && hasSpentTime) {
      return true;
    }

    return false;
  };

  getScrollDepth = function () {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    return (scrollTop / (documentHeight - windowHeight)) * 100;
  };

  getTimeSinceLastClick = function () {
    return this.lastClickTime ? Date.now() - this.lastClickTime : Infinity;
  };

  updateNavigationState = function (url) {
    this.navigationState.navigationCount++;
    this.navigationState.lastPageUrl = this.navigationState.currentPageUrl;
    this.navigationState.currentPageUrl = url;
    this.navigationState.pageEntryTime = Date.now();

    // Update forward stack if needed
    if (
      this.navigationState.currentPosition <
      this.navigationState.forwardStack.length - 1
    ) {
      this.navigationState.forwardStack =
        this.navigationState.forwardStack.slice(
          0,
          this.navigationState.currentPosition + 1
        );
    }
  };

  bindChatEvents() {
    // Close button
    const closeBtn = document.querySelector('#minimise_btn .cht_close');
    if (closeBtn) {
      closeBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.chatState.isAnimating) {
          this.closeChat();
        }
      });
    }

    // Chat button
    const chatBtn = document.querySelector('.Darban_search');
    if (chatBtn) {
      chatBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.chatState.isAnimating) {
          this.openChat(false);
        }
      });
    }
  }

  openChat(isAutoOpen = false) {
    if (this.chatState.isAnimating || this.chatState.isOpen) return;

    const chatWindow = document.querySelector('.Darban_search_open_window');
    const chatButton = document.querySelector('.Darban_search');

    if (!chatWindow || !chatButton) return;

    this.chatState.isAnimating = true;
    this.chatState.isOpen = true;

    if (isAutoOpen && !this.chatState.hasAutoOpened) {
      this.chatState.hasAutoOpened = true;
    }

    if (!isAutoOpen) {
      this.chatState.forceClosed = false;
      sessionStorage.removeItem('exitIntentChatClosed');
    }

    chatWindow.style.display = 'block';
    chatButton.style.display = 'none';

    requestAnimationFrame(() => {
      chatWindow.classList.remove('closing');
      chatWindow.classList.add('active');

      // Enable chat input when opening
      enableChatInput().catch(error => {
        console.error('Error enabling chat input:', error);
      });

      setTimeout(() => {
        this.chatState.isAnimating = false;
      }, this.exitConfig.closeTransitionTime);
    });
  }

  // Update the closeChat method
  closeChat() {
    if (this.chatState.isAnimating) return;

    const chatWindow = document.querySelector('.Darban_search_open_window');
    const chatButton = document.querySelector('.Darban_search');

    if (!chatWindow || !chatButton) return;

    this.chatState.isAnimating = true;
    this.chatState.isOpen = false;

    if (this.chatState.hasAutoOpened) {
      this.chatState.forceClosed = true;
      sessionStorage.setItem('exitIntentChatClosed', 'true');
    }

    chatWindow.classList.add('closing');
    chatWindow.classList.remove('active');

    setTimeout(() => {
      chatWindow.style.display = 'none';
      chatButton.style.display = 'block';
      chatWindow.classList.remove('closing');
      this.chatState.isAnimating = false;
    }, this.exitConfig.closeTransitionTime);
  }

  hideChat() {
    const chatWindow = document.querySelector('.Darban_search_open_window');
    const chatButton = document.querySelector('.Darban_search');

    if (chatWindow && chatButton) {
      chatWindow.style.display = 'none';
      chatWindow.classList.remove('active', 'closing');
      chatButton.style.display = 'block';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cleanup = EnhancedTracker.init();
  document.addEventListener('pagehide', cleanup, { once: true });
});

document.addEventListener('DOMContentLoaded', function () {
  initializeChatToggle();

  document
    .querySelector('.Darban_search')
    .addEventListener('click', async () => {
      await enableChatInput();
    });

  const chatContainer = document.querySelector('.right-chat');

  if (chatContainer) {
    chatContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = chatContainer;
      const isNearBottom =
        scrollHeight - scrollTop - clientHeight < ScrollState.config.threshold;

      ScrollState.isUserScrolling = !isNearBottom;
      ScrollState.lastScrollTop = scrollTop;
    });

    const observer = new MutationObserver(() => {
      if (!ScrollState.isUserScrolling) {
        smoothStreamScroll();
      }
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
  }

  // Get DOM elements
  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-button');
  const sensitiveInfoMain = document.querySelector('.sensitive_info_main');
  const refreshUser = document.querySelector('.refresh-user');

  function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
      sendMessageOnSearch(message);
      chatInput.style.height = '45px';
      chatInput.style.overflow = 'hidden';
      chatInput.value = '';

      if (refreshUser) {
        refreshUser.style.display = 'block';
      }
    }
  }
  chatInput.addEventListener('input', function () {
    this.style.height = '45px';
    const newHeight = this.scrollHeight;
    this.style.height = `${newHeight}px`;

    // Handle overflow
    if (newHeight >= 100) {
      this.style.overflowY = 'scroll';
      this.style.overflowX = 'hidden';
    } else {
      this.style.overflow = 'hidden';
    }
  });

  // Handle Enter key
  chatInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // Handle send button click
  sendButton.addEventListener('click', function (event) {
    event.preventDefault();
    sendMessage();
  });

  // Handle focus events
  chatInput.addEventListener('focus', function () {
    if (sensitiveInfoMain) {
      sensitiveInfoMain.style.display = 'none';
    }
    this.setAttribute('placeholder', 'Type your message...');

    // Scroll chat to bottom with delay to account for keyboard
    setTimeout(() => {
      const chatContainer = document.querySelector('.ques_with_ans_main');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 300);
  });

  // Handle Android keyboard
  if (/Android/i.test(navigator.userAgent)) {
    const originalHeight = window.innerHeight;

    window.addEventListener('resize', function () {
      const currentHeight = window.innerHeight;
      const keyboardVisible = currentHeight < originalHeight;

      if (keyboardVisible) {
        // Just scroll to make input visible when keyboard appears
        setTimeout(() => {
          const chatContainer = document.querySelector('.ques_with_ans_main');
          if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        }, 100);
      }
    });
  }

  // Add resize observer for dynamic height adjustments
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === chatInput) {
        const chatContainer = document.querySelector('.ques_with_ans_main');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }
    }
  });

  resizeObserver.observe(chatInput);

  window.pageTracker = new PageTracker();
});

function updateVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Update on initial load
updateVH();

// Update on resize and orientation change
window.addEventListener('resize', updateVH);
window.addEventListener('orientationchange', updateVH);

$(document).ready(function () {
  const userInteractionState = {
    hasInteracted: false,
    messageCount: 0,
    lastInteractionTime: null,
  };

  function hasUserGivenFeedback() {
    const feedbackKey = `zoya_feedback_${sessionId}_${userid}`;
    return localStorage.getItem(feedbackKey) === 'true';
  }

  function markFeedbackAsGiven() {
    const feedbackKey = `zoya_feedback_${sessionId}_${userid}`;
    localStorage.setItem(feedbackKey, 'true');
  }

  // Initially hide the feedback bar
  $('.feedback-bar').hide();

  function showFeedbackBar() {
    if (!hasUserGivenFeedback() && userInteractionState.hasInteracted) {
      $('.feedback-bar').fadeIn(300);
      $('.feedback-btn').prop('disabled', false);
    }
  }

  const originalSendMessageOnSearch = window.sendMessageOnSearch;
  window.sendMessageOnSearch = function (...args) {
    userInteractionState.hasInteracted = true;
    userInteractionState.messageCount++;
    userInteractionState.lastInteractionTime = Date.now();
    showFeedbackBar();
    return originalSendMessageOnSearch.apply(this, args);
  };

  $(document).on('click', '.msgbuttons, .default-que', function () {
    userInteractionState.hasInteracted = true;
    userInteractionState.messageCount++;
    userInteractionState.lastInteractionTime = Date.now();
    showFeedbackBar();
  });

  $('.feedback-btn').click(function () {
    const $button = $(this);
    const $feedbackBar = $('.feedback-bar');
    const isHelpful = $button.hasClass('like');

    if (
      !sessionId ||
      typeof sessionId !== 'string' ||
      sessionId.trim() === ''
    ) {
      console.error('Invalid sessionId:', sessionId);
      alert(
        'Unable to submit feedback at this time. Please try refreshing the page.'
      );
      return;
    }

    // Disable both buttons when one is clicked
    $('.feedback-btn').prop('disabled', true);
    $button.addClass('selected');

    fetch(
      'https://9muymsjvg1.execute-api.us-east-1.amazonaws.com/production/setChatHelpfulStatus',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          isHelpful: isHelpful,
          interactionData: {
            messageCount: userInteractionState.messageCount,
            interactionTime: userInteractionState.lastInteractionTime,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    )
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        console.log('Feedback submitted successfully:', data);

        markFeedbackAsGiven();

        $feedbackBar.fadeOut(300, function () {
          $(this).remove();
        });

        if (wsHandler?.ws?.readyState === WebSocket.OPEN) {
          wsHandler.send({
            action: 'trackInteraction',
            subAction: 'feedback',
            sessionId: sessionId,
            userId: userid,
            clientId: clientId,
            currentPage: getCurrentUrl(),
            feedbackData: {
              isHelpful,
              timestamp: new Date().toISOString(),
              interactionStats: {
                messageCount: userInteractionState.messageCount,
                timeSpent:
                  Date.now() - userInteractionState.lastInteractionTime,
              },
            },
          });
        }

        enableChatInput();
      })
      .catch(error => {
        console.error('Error submitting feedback:', error);

        $('.feedback-btn').prop('disabled', false).removeClass('selected');

        const errorMessage =
          error.status === 404
            ? 'Session not found. Please try refreshing the page.'
            : 'Unable to submit feedback. Please try again later.';

        $feedbackBar.append(
          `<div class="feedback-error" style="color: #dc3545; font-size: 12px; margin-top: 5px;">
            ${errorMessage}
          </div>`
        );

        setTimeout(() => {
          $('.feedback-error').fadeOut(300, function () {
            $(this).remove();
          });
        }, 5000);

        enableChatInput();
      });
  });

  // Check if feedback was already given
  if (hasUserGivenFeedback()) {
    $('.feedback-bar').remove();
  }
});
