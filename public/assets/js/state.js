export const state = {
  user: null,
  location: {
    areaCode: 'all',
    coords: null,
    address: ''
  },
  marketplace: {
    listingType: 'buy',
    q: '',
    category: '',
    city: '',
    sort: 'newest',
    limit: 24,
    offset: 0
  },
  community: {
    q: '',
    categorySlug: ''
  },
  notifications: {
    unreadCount: 0,
    limit: 20,
    offset: 0,
    unreadOnly: false
  },
  admin: {
    q: '',
    actionType: '',
    entityType: '',
    actorId: '',
    limit: 50,
    offset: 0
  }
};
