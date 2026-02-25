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
  }
};
