(function luckmailUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.LuckMailUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createLuckmailUtils() {
  const DEFAULT_LUCKMAIL_BASE_URL = 'https://mails.luckyous.com';
  const DEFAULT_LUCKMAIL_EMAIL_TYPE = 'ms_graph';
  const DEFAULT_LUCKMAIL_PROJECT_CODE = 'openai';
  const DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME = '保留';
  const LUCKMAIL_EMAIL_TYPES = ['self_built', 'ms_imap', 'ms_graph', 'google_variant'];
  const LUCKMAIL_REMOTE_USED_TEXT_PATTERNS = [
    /已(?:经)?(?:用|使用|注册|验证)/,
    /(?:使用|注册|验证)过/,
    /^(?:used|already[-_\s]*used|used[-_\s]*email|registered|verified|consumed)$/i,
  ];
  const LUCKMAIL_REMOTE_UNUSED_TEXT_PATTERNS = [
    /^(?:未用|未使用|未注册|未验证|可用|空闲|unused|not[-_\s]*used|available|fresh|new)$/i,
  ];

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function firstObject(values) {
    for (const value of values) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
      }
    }
    return {};
  }

  function firstArrayItem(values) {
    for (const value of values) {
      if (Array.isArray(value) && value.length > 0) {
        return value[0];
      }
    }
    return null;
  }

  function normalizeBooleanFlag(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = normalizeText(value);
    if (!normalized) return false;
    if (/^(?:1|true|yes|y|used|already[-_\s]*used|已用|已使用)$/.test(normalized)) {
      return true;
    }
    if (/^(?:0|false|no|n|unused|not[-_\s]*used|未用|未使用)$/.test(normalized)) {
      return false;
    }
    return false;
  }

  function getLuckmailTagLikeFields(safeItem = {}) {
    const tagObject = firstObject([safeItem.tag, firstArrayItem([safeItem.tags])]);
    const labelObject = firstObject([safeItem.label, firstArrayItem([safeItem.labels])]);
    const tagName = firstNonEmptyString([
      safeItem.tag_name,
      safeItem.tagName,
      tagObject.name,
      tagObject.tag_name,
      typeof safeItem.tag === 'string' ? safeItem.tag : '',
      safeItem.label_name,
      safeItem.labelName,
      labelObject.name,
      labelObject.label_name,
      typeof safeItem.label === 'string' ? safeItem.label : '',
    ]);
    const tagId = Number(
      safeItem.tag_id
      || safeItem.tagId
      || tagObject.id
      || tagObject.tag_id
      || safeItem.label_id
      || safeItem.labelId
      || labelObject.id
      || labelObject.label_id
      || 0
    ) || 0;
    return { tagId, tagName };
  }

  function normalizeTimestamp(value) {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : 0;
    }

    const rawValue = String(value || '').trim();
    const utcLikeMatch = rawValue.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (utcLikeMatch && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(rawValue)) {
      const [, year, month, day, hour, minute, second = '0'] = utcLikeMatch;
      return Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        0
      );
    }

    const timestamp = Date.parse(rawValue);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function normalizeLuckmailBaseUrl(rawValue = '') {
    const value = String(rawValue || '').trim();
    if (!value) return DEFAULT_LUCKMAIL_BASE_URL;

    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return DEFAULT_LUCKMAIL_BASE_URL;
      }
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_LUCKMAIL_BASE_URL;
    }
  }

  function normalizeLuckmailEmailType(rawValue = '') {
    const normalized = String(rawValue || '').trim().toLowerCase();
    return LUCKMAIL_EMAIL_TYPES.includes(normalized)
      ? normalized
      : DEFAULT_LUCKMAIL_EMAIL_TYPE;
  }

  function normalizeLuckmailProjectName(rawValue = '') {
    return normalizeText(rawValue);
  }

  function extractLuckmailVerificationCode(text) {
    const source = String(text || '');
    const matchCn = source.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/i);
    if (matchCn) return matchCn[1];

    const matchOpenAiLogin = source.match(/(?:chatgpt\s+log-?in\s+code|enter\s+this\s+code)[^0-9]{0,24}(\d{6})/i);
    if (matchOpenAiLogin) return matchOpenAiLogin[1];

    const matchChatGPT = source.match(/your\s+chatgpt\s+code\s+is\s+(\d{6})/i);
    if (matchChatGPT) return matchChatGPT[1];

    const matchEn = source.match(/code(?:\s+is|[\s:])+(\d{6})/i);
    if (matchEn) return matchEn[1];

    const matchStandalone = source.match(/\b(\d{6})\b/);
    return matchStandalone ? matchStandalone[1] : null;
  }

  function normalizeLuckmailTag(item = {}) {
    const safeItem = item && typeof item === 'object' ? item : {};
    return {
      id: Number(safeItem.id) || 0,
      name: firstNonEmptyString([safeItem.name, safeItem.tag_name]),
      remark: firstNonEmptyString([safeItem.remark]),
      limit_type: Number(safeItem.limit_type) || 0,
      purchase_count: Number(safeItem.purchase_count) || 0,
      created_at: firstNonEmptyString([safeItem.created_at]) || null,
    };
  }

  function normalizeLuckmailTags(input) {
    const list = Array.isArray(input?.list)
      ? input.list
      : (Array.isArray(input) ? input : []);
    return list
      .map((item) => normalizeLuckmailTag(item))
      .filter((item) => item.id > 0 || item.name);
  }

  function normalizeLuckmailPurchase(item = {}) {
    const safeItem = item && typeof item === 'object' ? item : {};
    const projectName = firstNonEmptyString([safeItem.project_name, safeItem.project]);
    const tagInfo = getLuckmailTagLikeFields(safeItem);
    const statusText = firstNonEmptyString([
      safeItem.status_text,
      safeItem.statusText,
      safeItem.status_label,
      safeItem.statusLabel,
      safeItem.state,
      typeof safeItem.status === 'string' ? safeItem.status : '',
    ]);
    return {
      id: Number(safeItem.id) || 0,
      email_address: firstNonEmptyString([safeItem.email_address, safeItem.address]),
      token: firstNonEmptyString([safeItem.token]),
      project_name: projectName,
      project_code: normalizeLuckmailProjectName(projectName),
      price: firstNonEmptyString([safeItem.price]) || '0.0000',
      status: Number(safeItem.status) || 0,
      status_text: statusText,
      tag_id: tagInfo.tagId,
      tag_name: tagInfo.tagName,
      user_disabled: Number(safeItem.user_disabled) || 0,
      warranty_hours: Number(safeItem.warranty_hours) || 0,
      warranty_until: firstNonEmptyString([safeItem.warranty_until]) || null,
      created_at: firstNonEmptyString([safeItem.created_at]) || null,
      used: [safeItem.used, safeItem.is_used, safeItem.has_used].some((value) => normalizeBooleanFlag(value)),
      used_at: firstNonEmptyString([safeItem.used_at, safeItem.last_used_at, safeItem.consumed_at]) || null,
      usage_status: firstNonEmptyString([safeItem.usage_status, safeItem.used_state, safeItem.use_status]),
    };
  }

  function normalizeLuckmailPurchases(result) {
    const list = Array.isArray(result?.purchases)
      ? result.purchases
      : (Array.isArray(result) ? result : []);
    return list.map((item) => normalizeLuckmailPurchase(item));
  }

  function normalizeLuckmailPurchaseListPage(result = {}) {
    const safeResult = result && typeof result === 'object' ? result : {};
    const list = Array.isArray(safeResult.list)
      ? safeResult.list
      : (Array.isArray(safeResult.purchases) ? safeResult.purchases : []);
    const total = Number(safeResult.total);
    return {
      list: list.map((item) => normalizeLuckmailPurchase(item)),
      total: Number.isFinite(total) && total >= 0 ? total : 0,
      page: Math.max(1, Number(safeResult.page) || 1),
      page_size: Math.max(1, Number(safeResult.page_size || safeResult.pageSize) || list.length || 1),
    };
  }

  function normalizeLuckmailPurchaseId(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return '';
    }
    return String(Math.floor(numeric));
  }

  function normalizeLuckmailUsedPurchases(rawValue = {}) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return {};
    }

    return Object.entries(rawValue).reduce((result, [key, value]) => {
      const normalizedKey = normalizeLuckmailPurchaseId(key);
      if (!normalizedKey) {
        return result;
      }
      result[normalizedKey] = Boolean(value);
      return result;
    }, {});
  }

  function isLuckmailPurchaseForProject(purchase, projectCode = DEFAULT_LUCKMAIL_PROJECT_CODE) {
    const normalizedPurchase = normalizeLuckmailPurchase(purchase);
    return normalizeLuckmailProjectName(normalizedPurchase.project_name) === normalizeLuckmailProjectName(projectCode);
  }

  function normalizeLuckmailTokenMail(mail = {}) {
    const safeMail = mail && typeof mail === 'object' ? mail : {};
    const subject = firstNonEmptyString([safeMail.subject, safeMail.title]);
    const body = firstNonEmptyString([safeMail.body, safeMail.body_text, safeMail.text]);
    const htmlBody = firstNonEmptyString([safeMail.html_body, safeMail.body_html, safeMail.html]);
    const from = firstNonEmptyString([safeMail.from, safeMail.sender]);
    const verificationCode = firstNonEmptyString([safeMail.verification_code])
      || extractLuckmailVerificationCode([subject, body, htmlBody, from].filter(Boolean).join(' '));

    return {
      message_id: firstNonEmptyString([safeMail.message_id, safeMail.id]),
      from,
      subject,
      body,
      html_body: htmlBody,
      received_at: firstNonEmptyString([safeMail.received_at, safeMail.receivedAt, safeMail.created_at]),
      verification_code: verificationCode || '',
    };
  }

  function normalizeLuckmailTokenMails(input) {
    const list = Array.isArray(input?.mails)
      ? input.mails
      : (Array.isArray(input) ? input : []);
    return list.map((mail) => normalizeLuckmailTokenMail(mail));
  }

  function normalizeLuckmailTokenCode(result = {}) {
    return {
      email_address: firstNonEmptyString([result.email_address, result.address]),
      project: firstNonEmptyString([result.project]),
      has_new_mail: Boolean(result.has_new_mail),
      verification_code: firstNonEmptyString([result.verification_code]) || null,
      mail: result.mail ? normalizeLuckmailTokenMail(result.mail) : null,
    };
  }

  function normalizeLuckmailMailCursor(cursor = {}) {
    const safeCursor = cursor && typeof cursor === 'object' ? cursor : {};
    return {
      messageId: firstNonEmptyString([safeCursor.messageId, safeCursor.message_id]),
      receivedAt: firstNonEmptyString([safeCursor.receivedAt, safeCursor.received_at]),
    };
  }

  function buildLuckmailMailCursor(mail = {}) {
    const normalizedMail = normalizeLuckmailTokenMail(mail);
    return normalizeLuckmailMailCursor({
      messageId: normalizedMail.message_id,
      receivedAt: normalizedMail.received_at,
    });
  }

  function buildLuckmailBaselineCursor(mails) {
    const latestMail = normalizeLuckmailTokenMails(mails)
      .sort((left, right) => {
        const leftTimestamp = normalizeTimestamp(left.received_at);
        const rightTimestamp = normalizeTimestamp(right.received_at);
        if (leftTimestamp !== rightTimestamp) {
          return rightTimestamp - leftTimestamp;
        }
        return String(right.message_id || '').localeCompare(String(left.message_id || ''));
      })[0] || null;

    return latestMail ? buildLuckmailMailCursor(latestMail) : null;
  }

  function isLuckmailMailNewerThanCursor(mail = {}, cursor = {}) {
    const normalizedMail = normalizeLuckmailTokenMail(mail);
    const normalizedCursor = normalizeLuckmailMailCursor(cursor);

    if (!normalizedCursor.messageId && !normalizedCursor.receivedAt) {
      return true;
    }

    if (normalizedMail.message_id && normalizedCursor.messageId && normalizedMail.message_id === normalizedCursor.messageId) {
      return false;
    }

    const mailTimestamp = normalizeTimestamp(normalizedMail.received_at);
    const cursorTimestamp = normalizeTimestamp(normalizedCursor.receivedAt);

    if (mailTimestamp && cursorTimestamp) {
      if (mailTimestamp > cursorTimestamp) return true;
      if (mailTimestamp < cursorTimestamp) return false;
      return Boolean(
        normalizedMail.message_id
        && normalizedCursor.messageId
        && normalizedMail.message_id !== normalizedCursor.messageId
      );
    }

    if (normalizedMail.message_id && normalizedCursor.messageId) {
      return normalizedMail.message_id !== normalizedCursor.messageId;
    }

    return !cursorTimestamp || Boolean(mailTimestamp && mailTimestamp > cursorTimestamp);
  }

  function isLuckmailPurchaseExpired(purchase, now = Date.now()) {
    const normalizedPurchase = normalizeLuckmailPurchase(purchase);
    const expiresAt = normalizeTimestamp(normalizedPurchase.warranty_until);
    return Boolean(expiresAt && expiresAt <= Number(now || 0));
  }

  function isLuckmailPurchaseDisabled(purchase) {
    return Number(normalizeLuckmailPurchase(purchase).user_disabled) === 1;
  }

  function isLuckmailPurchasePreserved(purchase, options = {}) {
    const normalizedPurchase = normalizeLuckmailPurchase(purchase);
    const expectedTagId = Number(options.preserveTagId) || 0;
    const expectedTagName = normalizeText(options.preserveTagName || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME);

    if (expectedTagId > 0 && normalizedPurchase.tag_id === expectedTagId) {
      return true;
    }

    return Boolean(normalizedPurchase.tag_name && normalizeText(normalizedPurchase.tag_name) === expectedTagName);
  }

  function hasLuckmailRemoteUsedTextSignal(value) {
    const text = normalizeText(value);
    if (!text) return false;
    if (LUCKMAIL_REMOTE_UNUSED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
      return false;
    }
    return LUCKMAIL_REMOTE_USED_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  }

  function isLuckmailPurchaseUsedByRemoteState(purchase) {
    const normalizedPurchase = normalizeLuckmailPurchase(purchase);
    if (normalizedPurchase.used) {
      return true;
    }
    if (normalizedPurchase.used_at) {
      return true;
    }
    return [
      normalizedPurchase.tag_name,
      normalizedPurchase.status_text,
      normalizedPurchase.usage_status,
    ].some((value) => hasLuckmailRemoteUsedTextSignal(value));
  }

  function isLuckmailPurchaseUsed(purchase, options = {}) {
    const normalizedPurchase = normalizeLuckmailPurchase(purchase);
    const usedPurchases = normalizeLuckmailUsedPurchases(options.usedPurchases);
    const purchaseId = normalizeLuckmailPurchaseId(normalizedPurchase.id);
    return Boolean(purchaseId && usedPurchases[purchaseId])
      || isLuckmailPurchaseUsedByRemoteState(normalizedPurchase);
  }

  function isLuckmailPurchaseReusable(purchase, options = {}) {
    const normalizedPurchase = normalizeLuckmailPurchase(purchase);
    const usedPurchases = normalizeLuckmailUsedPurchases(options.usedPurchases);
    const purchaseId = normalizeLuckmailPurchaseId(normalizedPurchase.id);

    if (!isLuckmailPurchaseForProject(normalizedPurchase, options.projectCode || DEFAULT_LUCKMAIL_PROJECT_CODE)) {
      return false;
    }
    if (!normalizedPurchase.email_address || !normalizedPurchase.token) {
      return false;
    }
    if (isLuckmailPurchaseDisabled(normalizedPurchase)) {
      return false;
    }
    if (purchaseId && usedPurchases[purchaseId]) {
      return false;
    }
    if (isLuckmailPurchaseUsedByRemoteState(normalizedPurchase)) {
      return false;
    }
    if (isLuckmailPurchasePreserved(normalizedPurchase, options)) {
      return false;
    }
    if (isLuckmailPurchaseExpired(normalizedPurchase, options.now || Date.now())) {
      return false;
    }
    return true;
  }

  function filterReusableLuckmailPurchases(purchases, options = {}) {
    const list = Array.isArray(purchases)
      ? purchases
      : normalizeLuckmailPurchaseListPage(purchases).list;
    return list
      .map((purchase) => normalizeLuckmailPurchase(purchase))
      .filter((purchase) => isLuckmailPurchaseReusable(purchase, options));
  }

  function pickReusableLuckmailPurchase(purchases, options = {}) {
    return filterReusableLuckmailPurchases(purchases, options)[0] || null;
  }

  function mailMatchesLuckmailFilters(mail, filters = {}) {
    const normalizedMail = normalizeLuckmailTokenMail(mail);
    const afterTimestamp = normalizeTimestamp(filters.afterTimestamp);
    const receivedAt = normalizeTimestamp(normalizedMail.received_at);
    if (afterTimestamp && receivedAt && receivedAt < afterTimestamp) {
      return null;
    }

    const senderFilters = (filters.senderFilters || []).map(normalizeText).filter(Boolean);
    const subjectFilters = (filters.subjectFilters || []).map(normalizeText).filter(Boolean);
    const excludedCodes = new Set((filters.excludeCodes || []).filter(Boolean));
    const combinedText = [
      normalizedMail.subject,
      normalizedMail.from,
      normalizedMail.body,
      normalizedMail.html_body,
    ].filter(Boolean).join(' ');
    const combinedTextNormalized = normalizeText(combinedText);
    const senderNormalized = normalizeText(normalizedMail.from);
    const subjectNormalized = normalizeText(normalizedMail.subject);
    const code = normalizedMail.verification_code || extractLuckmailVerificationCode(combinedText);

    if (!code || excludedCodes.has(code)) {
      return null;
    }

    const senderMatch = senderFilters.length === 0
      ? true
      : senderFilters.some((item) => senderNormalized.includes(item) || combinedTextNormalized.includes(item));
    const subjectMatch = subjectFilters.length === 0
      ? true
      : subjectFilters.some((item) => subjectNormalized.includes(item) || combinedTextNormalized.includes(item));

    if (!senderMatch && !subjectMatch) {
      return null;
    }

    return {
      code,
      mail: normalizedMail,
      receivedAt,
    };
  }

  function pickLuckmailVerificationMail(mails, filters = {}) {
    const matches = normalizeLuckmailTokenMails(mails)
      .map((mail) => mailMatchesLuckmailFilters(mail, filters))
      .filter(Boolean)
      .sort((left, right) => {
        if (left.receivedAt !== right.receivedAt) {
          return right.receivedAt - left.receivedAt;
        }
        return String(right.mail.message_id || '').localeCompare(String(left.mail.message_id || ''));
      });

    return matches[0] || null;
  }

  return {
    DEFAULT_LUCKMAIL_BASE_URL,
    DEFAULT_LUCKMAIL_EMAIL_TYPE,
    DEFAULT_LUCKMAIL_PROJECT_CODE,
    DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
    LUCKMAIL_EMAIL_TYPES,
    buildLuckmailBaselineCursor,
    buildLuckmailMailCursor,
    extractLuckmailVerificationCode,
    filterReusableLuckmailPurchases,
    isLuckmailMailNewerThanCursor,
    isLuckmailPurchaseDisabled,
    isLuckmailPurchaseExpired,
    isLuckmailPurchaseForProject,
    isLuckmailPurchasePreserved,
    isLuckmailPurchaseUsed,
    isLuckmailPurchaseUsedByRemoteState,
    isLuckmailPurchaseReusable,
    normalizeLuckmailBaseUrl,
    normalizeLuckmailEmailType,
    normalizeLuckmailMailCursor,
    normalizeLuckmailProjectName,
    normalizeLuckmailPurchase,
    normalizeLuckmailPurchaseId,
    normalizeLuckmailPurchaseListPage,
    normalizeLuckmailPurchases,
    normalizeLuckmailTag,
    normalizeLuckmailTags,
    normalizeLuckmailTokenCode,
    normalizeLuckmailTokenMail,
    normalizeLuckmailTokenMails,
    normalizeLuckmailUsedPurchases,
    normalizeText,
    normalizeTimestamp,
    pickLuckmailVerificationMail,
    pickReusableLuckmailPurchase,
  };
});
