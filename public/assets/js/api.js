function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

async function apiRequest(path, { method = 'GET', body, formData } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: {}
  };

  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const api = {
  health: () => apiRequest('/api/health'),
  signupTotpSetup: (data) => apiRequest('/api/auth/signup/totp/setup', { method: 'POST', body: data }),
  authRegister: (data) => apiRequest('/api/auth/register', { method: 'POST', body: data }),
  authLogin: (data) => apiRequest('/api/auth/login', { method: 'POST', body: data }),
  authLogout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  authMe: () => apiRequest('/api/auth/me'),
  updateProfile: (data) => apiRequest('/api/profile', { method: 'PATCH', body: data }),
  changePassword: (data) => apiRequest('/api/profile/change-password', { method: 'POST', body: data }),
  setupTotp: () => apiRequest('/api/profile/totp/setup', { method: 'POST' }),
  enableTotp: (code) => apiRequest('/api/profile/totp/enable', { method: 'POST', body: { code } }),
  disableTotp: (data) => apiRequest('/api/profile/totp/disable', { method: 'POST', body: data }),
  listNotifications: (filters) => apiRequest(`/api/notifications${buildQuery(filters)}`),
  readNotification: (id) => apiRequest(`/api/notifications/${id}/read`, { method: 'POST' }),
  readAllNotifications: () => apiRequest('/api/notifications/read-all', { method: 'POST' }),
  pushPublicKey: () => apiRequest('/api/push/public-key'),
  pushToggle: (enabled) => apiRequest('/api/push/toggle', { method: 'POST', body: { enabled } }),
  pushSubscribe: (payload) => apiRequest('/api/push/subscribe', { method: 'POST', body: payload }),
  pushUnsubscribe: (endpoint) => apiRequest('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  listAreas: () => apiRequest('/api/areas'),
  getDeliveryRateSetting: () => apiRequest('/api/settings/delivery-rate'),
  locationNearby: (lat, lon) => apiRequest(`/api/location/nearby?lat=${lat}&lon=${lon}`),
  locationGeocode: (q) => apiRequest(`/api/location/geocode${buildQuery({ q })}`),
  locationCities: (filters) => apiRequest(`/api/location/cities${buildQuery(filters)}`),
  listListings: (filters) => apiRequest(`/api/listings${buildQuery(filters)}`),
  listingById: (id) => apiRequest(`/api/listings/${id}`),
  createListing: (data) => apiRequest('/api/listings', { method: 'POST', body: data }),
  updateListing: (id, data) => apiRequest(`/api/listings/${id}`, { method: 'PUT', body: data }),
  deleteListing: (id) => apiRequest(`/api/listings/${id}`, { method: 'DELETE' }),
  uploadListingMedia: (listingId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest(`/api/listings/${listingId}/media`, { method: 'POST', formData });
  },
  listCommunityCategories: () => apiRequest('/api/community/categories'),
  listCommunityPosts: (filters) => apiRequest(`/api/community/posts${buildQuery(filters)}`),
  communityPostById: (id) => apiRequest(`/api/community/posts/${id}`),
  createCommunityPost: (data) => apiRequest('/api/community/posts', { method: 'POST', body: data }),
  updateCommunityPost: (postId, data) => apiRequest(`/api/community/posts/${postId}`, { method: 'PUT', body: data }),
  deleteCommunityPost: (postId) => apiRequest(`/api/community/posts/${postId}`, { method: 'DELETE' }),
  createCommunityComment: (postId, data) =>
    apiRequest(`/api/community/posts/${postId}/comments`, { method: 'POST', body: data }),
  updateCommunityComment: (commentId, data) => apiRequest(`/api/community/comments/${commentId}`, { method: 'PUT', body: data }),
  deleteCommunityComment: (commentId) => apiRequest(`/api/community/comments/${commentId}`, { method: 'DELETE' }),
  listDeliveryJobs: (filters) => apiRequest(`/api/delivery/jobs${buildQuery(filters)}`),
  deliveryJobById: (jobId) => apiRequest(`/api/delivery/jobs/${jobId}`),
  claimDeliveryJob: (jobId) => apiRequest(`/api/delivery/jobs/${jobId}/claim`, { method: 'POST' }),
  updateDeliveryJobStatus: (jobId, status, note = '') =>
    apiRequest(`/api/delivery/jobs/${jobId}/status`, {
      method: 'PUT',
      body: { status, ...(note ? { note } : {}) }
    }),
  deleteDeliveryJob: (jobId) => apiRequest(`/api/delivery/jobs/${jobId}`, { method: 'DELETE' }),
  createMarketplaceOrder: (data) => apiRequest('/api/orders', { method: 'POST', body: data }),
  listMyOrders: (filters) => apiRequest(`/api/orders/mine${buildQuery(filters)}`),
  listSellerOrders: (filters) => apiRequest(`/api/orders/seller${buildQuery(filters)}`),
  listDeliveryOrders: (filters) => apiRequest(`/api/orders/delivery${buildQuery(filters)}`),
  orderById: (orderId) => apiRequest(`/api/orders/${orderId}`),
  updateOrderStatus: (orderId, status, extra = {}) =>
    apiRequest(`/api/orders/${orderId}/status`, { method: 'PUT', body: { status, ...(extra || {}) } }),
  rateOrder: (orderId, payload) => apiRequest(`/api/orders/${orderId}/rating`, { method: 'POST', body: payload }),
  askAI: (payload) => apiRequest('/api/ai/chat', { method: 'POST', body: payload }),
  createFeedback: (data) => apiRequest('/api/feedback', { method: 'POST', body: data }),
  listMyFeedback: (filters) => apiRequest(`/api/feedback/mine${buildQuery(filters)}`),
  listBanners: (filters) => apiRequest(`/api/banners${buildQuery(filters)}`),
  listMyBanners: (filters) => apiRequest(`/api/banners/mine${buildQuery(filters)}`),
  createBanner: (data) => apiRequest('/api/banners', { method: 'POST', body: data }),
  updateBanner: (id, data) => apiRequest(`/api/banners/${id}`, { method: 'PUT', body: data }),
  deleteBanner: (id) => apiRequest(`/api/banners/${id}`, { method: 'DELETE' }),
  uploadBannerImage: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('/api/banners/upload', { method: 'POST', formData });
  },
  adminSummary: () => apiRequest('/api/admin/summary'),
  adminSetDeliveryRate: (amountPer10Km) =>
    apiRequest('/api/admin/settings/delivery-rate', { method: 'PUT', body: { amountPer10Km } }),
  listAdminActions: (filters) => apiRequest(`/api/admin/actions${buildQuery(filters)}`),
  adminDeleteAction: (actionId) => apiRequest(`/api/admin/actions/${actionId}`, { method: 'DELETE' }),
  listAdminFeedback: (filters) => apiRequest(`/api/admin/feedback${buildQuery(filters)}`),
  listAdminUsers: (filters) => apiRequest(`/api/admin/users${buildQuery(filters)}`),
  adminUserById: (userId) => apiRequest(`/api/admin/users/${userId}`),
  adminCreateUser: (data) => apiRequest('/api/admin/users', { method: 'POST', body: data }),
  adminUpdateUser: (userId, data) => apiRequest(`/api/admin/users/${userId}`, { method: 'PUT', body: data }),
  adminDeleteUser: (userId) => apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  adminChangePassword: (data) => apiRequest('/api/admin/change-password', { method: 'POST', body: data }),
  adminResetUserPassword: (data) => apiRequest('/api/admin/users/reset-password', { method: 'POST', body: data }),
  adminUserHistory: (userId, filters) => apiRequest(`/api/admin/users/${userId}/history${buildQuery(filters)}`)
};
