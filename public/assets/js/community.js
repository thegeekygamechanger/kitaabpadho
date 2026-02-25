import { api } from './api.js';
import { el, escapeHtml, hideModal, renderEmpty, setText, showModal } from './ui.js';

export function initCommunity({ state, openAuthModal }) {
  const postsWrap = el('communityPosts');
  const categoryFilter = el('communityCategoryFilter');
  const searchInput = el('communitySearchInput');
  const refreshBtn = el('communityRefreshBtn');
  const postForm = el('communityPostForm');
  const statusNode = el('communityStatus');
  const closeDetailBtn = el('closeCommunityDetailBtn');
  const detailNode = el('communityDetailContent');

  function postFilters() {
    return {
      q: state.community.q,
      categorySlug: state.community.categorySlug,
      limit: 20,
      offset: 0
    };
  }

  async function loadCategories() {
    try {
      const result = await api.listCommunityCategories();
      const categories = result.data || [];

      if (categoryFilter) {
        categoryFilter.innerHTML =
          '<option value="">All Topics</option>' +
          categories.map((cat) => `<option value="${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</option>`).join('');
      }

      if (postForm?.categorySlug) {
        postForm.categorySlug.innerHTML = categories
          .map((cat) => `<option value="${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</option>`)
          .join('');
      }
    } catch (error) {
      if (postsWrap) postsWrap.innerHTML = `<article class="state-empty state-error">${escapeHtml(error.message)}</article>`;
    }
  }

  function renderPosts(posts) {
    if (!Array.isArray(posts) || posts.length === 0) {
      postsWrap.innerHTML = renderEmpty('No community topics yet. Start the first one.');
      return;
    }

    postsWrap.innerHTML = posts
      .map(
        (post) => `<article class="card">
      <div class="card-body">
        <div class="card-meta">
          <span class="pill type-buy">${escapeHtml(post.categoryName || post.categorySlug)}</span>
          <span class="muted">${escapeHtml(post.authorName || 'Community member')}</span>
        </div>
        <h3 class="card-title">${escapeHtml(post.title)}</h3>
        <p class="muted">${escapeHtml(String(post.content || '').slice(0, 180))}</p>
        <p class="muted">${Number(post.commentCount || 0)} comments</p>
        <div class="card-actions">
          <button type="button" class="kb-btn kb-btn-dark view-community-btn" data-id="${post.id}">
            Open Discussion
          </button>
        </div>
      </div>
    </article>`
      )
      .join('');
  }

  async function refreshPosts() {
    if (!postsWrap) return;
    postsWrap.innerHTML = renderEmpty('Loading community topics...');
    try {
      const result = await api.listCommunityPosts(postFilters());
      renderPosts(result.data || []);
    } catch (error) {
      postsWrap.innerHTML = `<article class="state-empty state-error">${escapeHtml(error.message)}</article>`;
    }
  }

  async function openDiscussion(postId) {
    try {
      const post = await api.communityPostById(postId);
      const comments = post.comments || [];
      const commentsHtml =
        comments.length === 0
          ? '<p class="muted">No comments yet.</p>'
          : comments
              .map((comment) => {
                const canDelete = state.user && Number(comment.createdBy) === Number(state.user.id);
                return `<article style="padding:0.55rem;border:1px solid #d6e3ff;border-radius:10px;margin-bottom:0.5rem">
                  <strong>${escapeHtml(comment.authorName || 'Member')}</strong>
                  <p>${escapeHtml(comment.content)}</p>
                  ${
                    canDelete
                      ? `<button class="kb-btn kb-btn-ghost delete-comment-btn" data-id="${comment.id}" data-post-id="${post.id}" type="button">Delete</button>`
                      : ''
                  }
                </article>`;
              })
              .join('');

      const canComment = Boolean(state.user);
      detailNode.innerHTML = `
        <h3>${escapeHtml(post.title)}</h3>
        <p class="muted">${escapeHtml(post.categoryName || '')} · ${escapeHtml(post.authorName || 'Member')}</p>
        <p>${escapeHtml(post.content)}</p>
        <hr />
        <h4>Comments</h4>
        <div>${commentsHtml}</div>
        ${
          canComment
            ? `<form id="commentForm" data-post-id="${post.id}" style="display:grid;gap:0.5rem;margin-top:0.7rem">
              <textarea name="content" class="kb-textarea" placeholder="Write your comment..." required></textarea>
              <button class="kb-btn kb-btn-primary" type="submit">Comment</button>
            </form>`
            : '<p class="muted">Login to comment on this topic.</p>'
        }
        <p id="commentStatus" class="muted"></p>
      `;

      showModal('communityDetailModal');
    } catch (error) {
      detailNode.innerHTML = `<p class="state-error">${escapeHtml(error.message)}</p>`;
      showModal('communityDetailModal');
    }
  }

  async function submitPost(event) {
    event.preventDefault();
    if (!state.user) {
      openAuthModal('Please login to post in community.');
      return;
    }
    const form = event.currentTarget;
    setText('communityStatus', 'Publishing topic...');
    try {
      await api.createCommunityPost({
        title: form.title.value.trim(),
        categorySlug: form.categorySlug.value,
        content: form.content.value.trim()
      });
      form.reset();
      setText('communityStatus', 'Topic posted successfully.');
      await refreshPosts();
    } catch (error) {
      setText('communityStatus', error.message || 'Unable to post');
    }
  }

  postsWrap?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.view-community-btn');
    if (!button) return;
    openDiscussion(button.dataset.id);
  });

  detailNode?.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'commentForm') return;
    event.preventDefault();
    if (!state.user) {
      openAuthModal('Please login to comment.');
      return;
    }
    const postId = form.dataset.postId;
    setText('commentStatus', 'Posting comment...');
    try {
      await api.createCommunityComment(postId, { content: form.content.value.trim() });
      setText('commentStatus', 'Comment posted.');
      await openDiscussion(postId);
      await refreshPosts();
    } catch (error) {
      setText('commentStatus', error.message || 'Unable to comment');
    }
  });

  detailNode?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.delete-comment-btn');
    if (!button) return;
    try {
      await api.deleteCommunityComment(button.dataset.id);
      await openDiscussion(button.dataset.postId);
      await refreshPosts();
    } catch (error) {
      setText('commentStatus', error.message || 'Unable to delete comment');
    }
  });

  postForm?.addEventListener('submit', submitPost);
  refreshBtn?.addEventListener('click', () => {
    state.community.q = searchInput?.value.trim() || '';
    state.community.categorySlug = categoryFilter?.value || '';
    refreshPosts();
  });
  closeDetailBtn?.addEventListener('click', () => hideModal('communityDetailModal'));

  categoryFilter?.addEventListener('change', () => {
    state.community.categorySlug = categoryFilter.value || '';
    refreshPosts();
  });

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      state.community.q = searchInput.value.trim();
      refreshPosts();
    }
  });

  return {
    loadCategories,
    refreshPosts
  };
}
