export const state = {
  user: null,
  location: {
    areaCode: 'all',
    areaSelectValue: 'all',
    selectedCity: '',
    coords: null,
    address: '',
    areaOptions: [],
    nearbyCities: [],
    localityOptions: [],
    localitySelectionMap: {},
    radiusKm: 250
  },
  marketplace: {
    scope: 'local',
    listingType: 'buy',
    q: '',
    category: '',
    sellerType: '',
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
