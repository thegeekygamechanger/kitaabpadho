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

  function canManageByOwnerId(ownerId) {
    if (!state.user) return false;
    return state.user.role === 'admin' || Number(ownerId) === Number(state.user.id);
  }

  function postFilters() {
    return {
      q: state.community.q,
      categorySlug: state.community.categorySlug,
      limit: 20,
      offset: 0
    };
  }

  async function loadCategories() {
    if (!state.user) {
      if (categoryFilter) categoryFilter.innerHTML = '<option value="">Login Required</option>';
      if (postForm?.categorySlug) postForm.categorySlug.innerHTML = '';
      return;
    }
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
    if (!state.user) {
      postsWrap.innerHTML = renderEmpty('Login / Signup to access Community discussions.');
      return;
    }
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
      const canManagePost = canManageByOwnerId(post.createdBy);
      const comments = post.comments || [];
      const commentsHtml =
        comments.length === 0
          ? '<p class="muted">No comments yet.</p>'
          : comments
              .map((comment) => {
                const canManageComment = canManageByOwnerId(comment.createdBy);
                return `<article style="padding:0.55rem;border:1px solid #d6e3ff;border-radius:10px;margin-bottom:0.5rem">
                  <strong>${escapeHtml(comment.authorName || 'Member')}</strong>
                  <p>${escapeHtml(comment.content)}</p>
                  ${
                    canManageComment
                      ? `<div class="drawer-actions">
                          <button class="kb-btn kb-btn-ghost edit-comment-btn" data-id="${comment.id}" data-post-id="${post.id}" type="button">Edit</button>
                          <button class="kb-btn kb-btn-ghost delete-comment-btn" data-id="${comment.id}" data-post-id="${post.id}" type="button">Delete</button>
                        </div>`
                      : ''
                  }
                </article>`;
              })
              .join('');

      const canComment = Boolean(state.user);
      detailNode.innerHTML = `
        <h3>${escapeHtml(post.title)}</h3>
        <p class="muted">${escapeHtml(post.categoryName || '')} | ${escapeHtml(post.authorName || 'Member')}</p>
        <p>${escapeHtml(post.content)}</p>
        ${
          canManagePost
            ? `<div class="drawer-actions" style="margin:0.5rem 0 0.7rem">
                 <button class="kb-btn kb-btn-dark edit-post-btn" data-id="${post.id}" type="button">Edit Topic</button>
                 <button class="kb-btn kb-btn-dark delete-post-btn" data-id="${post.id}" type="button">Delete Topic</button>
               </div>`
            : ''
        }
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

    const editPostBtn = target.closest('.edit-post-btn');
    if (editPostBtn) {
      const postId = editPostBtn.dataset.id;
      try {
        const post = await api.communityPostById(postId);
        const nextTitle = window.prompt('Update topic title', post.title || '');
        if (nextTitle === null) return;
        const nextContent = window.prompt('Update topic content', post.content || '');
        if (nextContent === null) return;
        const nextCategory = window.prompt('Update category slug', post.categorySlug || '');
        if (nextCategory === null) return;

        await api.updateCommunityPost(postId, {
          title: nextTitle.trim(),
          content: nextContent.trim(),
          categorySlug: nextCategory.trim()
        });
        await openDiscussion(postId);
        await refreshPosts();
      } catch (error) {
        setText('commentStatus', error.message || 'Unable to update topic');
      }
      return;
    }

    const deletePostBtn = target.closest('.delete-post-btn');
    if (deletePostBtn) {
      const postId = deletePostBtn.dataset.id;
      const ok = window.confirm('Delete this topic and all comments?');
      if (!ok) return;
      try {
        await api.deleteCommunityPost(postId);
        hideModal('communityDetailModal');
        await refreshPosts();
      } catch (error) {
        setText('commentStatus', error.message || 'Unable to delete topic');
      }
      return;
    }

    const editCommentBtn = target.closest('.edit-comment-btn');
    if (editCommentBtn) {
      try {
        const post = await api.communityPostById(editCommentBtn.dataset.postId);
        const current = (post.comments || []).find((item) => Number(item.id) === Number(editCommentBtn.dataset.id));
        const nextContent = window.prompt('Update comment', current?.content || '');
        if (nextContent === null) return;
        await api.updateCommunityComment(editCommentBtn.dataset.id, { content: nextContent.trim() });
        await openDiscussion(editCommentBtn.dataset.postId);
        await refreshPosts();
      } catch (error) {
        setText('commentStatus', error.message || 'Unable to update comment');
      }
      return;
    }

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
