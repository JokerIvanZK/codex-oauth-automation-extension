const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

function extractConst(name) {
  const match = source.match(new RegExp(`const ${name} = [^\\n]+;`));
  if (!match) {
    throw new Error(`missing const ${name}`);
  }
  return match[0];
}

const bundle = [
  extractConst('ADD_EMAIL_PAGE_PATTERN'),
  extractFunction('getPageTextSnapshot'),
  extractFunction('getLoginVerificationDisplayedEmail'),
  extractFunction('getPhoneVerificationDisplayedPhone'),
  extractFunction('isPhoneVerificationPageReady'),
  extractFunction('isAddEmailPageReady'),
  extractFunction('inspectLoginAuthState'),
  extractFunction('normalizeStep6Snapshot'),
].join('\n');

const realInputBundle = [
  extractConst('LOGIN_PHONE_ENTRY_PAGE_PATTERN'),
  extractFunction('getPageTextSnapshot'),
  extractFunction('isLoginPhoneUsernameKind'),
  extractFunction('isLoginPhoneEntryPageText'),
  extractFunction('getLoginEmailInput'),
  extractFunction('getLoginPhoneInput'),
].join('\n');

function createApi(overrides = {}) {
  return new Function(`
const location = {
  href: ${JSON.stringify(overrides.href || 'https://auth.openai.com/log-in')},
  pathname: ${JSON.stringify(overrides.pathname || '/log-in')},
};

const document = {
  body: {
    innerText: ${JSON.stringify(overrides.pageText || '')},
    textContent: ${JSON.stringify(overrides.pageText || '')},
  },
  querySelector() {
    return null;
  },
};

function getLoginTimeoutErrorPageState() {
  return ${JSON.stringify(overrides.retryState || null)};
}

function getVerificationCodeTarget() {
  return ${JSON.stringify(overrides.verificationTarget || null)};
}

function getLoginPasswordInput() {
  return ${JSON.stringify(overrides.passwordInput || null)};
}

function getLoginEmailInput() {
  return ${JSON.stringify(overrides.emailInput || null)};
}

function findOneTimeCodeLoginTrigger() {
  return ${JSON.stringify(overrides.switchTrigger || null)};
}

function findLoginEntryTrigger() {
  return ${JSON.stringify(overrides.loginEntryTrigger || null)};
}

function getLoginSubmitButton() {
  return ${JSON.stringify(overrides.submitButton || null)};
}

function isVerificationPageStillVisible() {
  return ${JSON.stringify(Boolean(overrides.verificationVisible))};
}

function isAddPhonePageReady() {
  return ${JSON.stringify(Boolean(overrides.addPhonePage))};
}

function isVisibleElement() {
  return true;
}

function isStep8Ready() {
  return ${JSON.stringify(Boolean(overrides.consentReady))};
}

function isOAuthConsentPage() {
  return ${JSON.stringify(Boolean(overrides.oauthConsentPage))};
}

${bundle}

return {
  inspectLoginAuthState,
  isAddEmailPageReady,
  isPhoneVerificationPageReady,
  normalizeStep6Snapshot,
};
`)();
}

function createRealInputApi(overrides = {}) {
  return new Function(`
const location = {
  href: ${JSON.stringify(overrides.href || 'https://auth.openai.com/log-in')},
  pathname: ${JSON.stringify(overrides.pathname || '/log-in')},
};

const input = {
  name: ${JSON.stringify(overrides.inputName || 'username')},
  id: ${JSON.stringify(overrides.inputId || 'username')},
  type: ${JSON.stringify(overrides.inputType || 'text')},
  autocomplete: ${JSON.stringify(overrides.autocomplete || 'username')},
  getAttribute(name) {
    return this[name] || '';
  },
};

const document = {
  body: {
    innerText: ${JSON.stringify(overrides.pageText || '')},
    textContent: ${JSON.stringify(overrides.pageText || '')},
  },
  querySelector(selector) {
    if (String(selector).includes('username') || String(selector).includes('type="text"')) {
      return input;
    }
    return null;
  },
};

function isVisibleElement() {
  return true;
}

function isAddPhonePageReady() {
  return ${JSON.stringify(Boolean(overrides.addPhonePage))};
}

function isPhoneVerificationPageReady() {
  return ${JSON.stringify(Boolean(overrides.phoneVerificationPage))};
}

${realInputBundle}

return {
  getLoginEmailInput,
  getLoginPhoneInput,
  isLoginPhoneEntryPageText,
  isLoginPhoneUsernameKind,
};
`)();
}

{
  const api = createApi({
    emailInput: { id: 'email' },
    submitButton: { id: 'submit' },
    oauthConsentPage: true,
    consentReady: true,
  });

  const snapshot = api.inspectLoginAuthState();
  assert.strictEqual(
    snapshot.state,
    'email_page',
    '第六步在 /log-in 页应优先识别为邮箱页'
  );
}

{
  const api = createApi({
    emailInput: { id: 'email' },
    submitButton: { id: 'submit' },
    pageText: '登录或注册 继续使用 Google 登录 继续使用手机登录 继续使用电子邮件地址登录 电子邮件地址 继续',
  });

  assert.strictEqual(
    api.isAddEmailPageReady(),
    false,
    '普通登录弹窗里的电子邮件地址入口不应被误判为 add-email'
  );
  assert.strictEqual(api.inspectLoginAuthState().state, 'email_page');
}

{
  const api = createApi({
    pathname: '/add-email',
    href: 'https://auth.openai.com/add-email',
    emailInput: { id: 'email' },
    submitButton: { id: 'submit' },
    pageText: '要求提供电子邮件地址 你可以使用此电子邮件登录',
  });

  assert.strictEqual(api.isAddEmailPageReady(), true);
  assert.strictEqual(api.inspectLoginAuthState().state, 'add_email_page');
}

{
  const api = createRealInputApi({
    href: 'https://auth.openai.com/log-in?usernameKind=phone_number',
    pathname: '/log-in',
    inputName: 'username',
    inputType: 'text',
  });

  assert.strictEqual(api.isLoginPhoneUsernameKind(), true);
  assert.strictEqual(
    api.getLoginEmailInput(),
    null,
    '手机号登录 URL 上的 username 输入框不应被当成邮箱输入框'
  );
  assert.strictEqual(
    api.getLoginPhoneInput()?.name,
    'username',
    '手机号登录 URL 上的 username 输入框应被当成手机号输入框'
  );
}

{
  const api = createRealInputApi({
    href: 'https://auth.openai.com/log-in',
    pathname: '/log-in',
    inputName: 'username',
    inputType: 'text',
    pageText: '登录或注册 继续使用电子邮件地址登录 新加坡 +(65) +65 手机号码 继续',
  });

  assert.strictEqual(
    api.isLoginPhoneEntryPageText(),
    true,
    '手机号登录页应能通过页面文字识别'
  );
  assert.strictEqual(
    api.getLoginEmailInput(),
    null,
    '手机号登录页面文字出现时 username 输入框不应被当成邮箱输入框'
  );
  assert.strictEqual(
    api.getLoginPhoneInput()?.name,
    'username',
    '手机号登录页面文字出现时 username 输入框应被当成手机号输入框'
  );
}

{
  const api = createApi({
    verificationTarget: { id: 'otp' },
    pageText: 'We emailed a code to display.user@example.com. Enter it below.',
  });

  const snapshot = api.inspectLoginAuthState();
  assert.strictEqual(snapshot.displayedEmail, 'display.user@example.com');
}

{
  const api = createApi({
    pathname: '/email-verification',
    href: 'https://auth.openai.com/email-verification',
    verificationTarget: { id: 'otp' },
    pageText: 'We just sent to display.user@example.com. Enter it below.',
  });

  assert.strictEqual(
    api.isPhoneVerificationPageReady(),
    false,
    '邮箱验证码页不应被误判为手机验证码页'
  );

  const snapshot = api.inspectLoginAuthState();
  assert.strictEqual(snapshot.state, 'verification_page');
}

{
  const api = createApi({
    pathname: '/phone-verification',
    href: 'https://auth.openai.com/phone-verification',
    verificationTarget: { id: 'otp' },
    pageText: 'Check your phone. We just sent a code to +66 81 234 5678.',
  });

  assert.strictEqual(api.isPhoneVerificationPageReady(), true);

  const snapshot = api.inspectLoginAuthState();
  assert.strictEqual(snapshot.state, 'phone_verification_page');
}

{
  const api = createApi({
    pathname: '/email-verification',
    retryState: {
      retryEnabled: true,
      titleMatched: false,
      detailMatched: false,
      routeErrorMatched: true,
    },
    verificationTarget: { id: 'otp' },
    verificationVisible: true,
  });

  const snapshot = api.inspectLoginAuthState();
  assert.strictEqual(
    snapshot.state,
    'login_timeout_error_page',
    '第七步在 /email-verification 的登录重试页应优先识别为登录超时报错页'
  );
}

{
  const api = createApi({
    oauthConsentPage: true,
    consentReady: true,
  });

  const inspected = api.inspectLoginAuthState();
  assert.strictEqual(inspected.state, 'oauth_consent_page');

  const snapshot = api.normalizeStep6Snapshot({
    state: 'oauth_consent_page',
    url: 'https://auth.openai.com/authorize',
  });

  assert.strictEqual(snapshot.state, 'oauth_consent_page', '第六步应保留 oauth_consent_page 状态');
}

{
  const api = createApi({
    loginEntryTrigger: { id: 'continue-email' },
  });

  const snapshot = api.inspectLoginAuthState();
  assert.strictEqual(snapshot.state, 'entry_page');
}

assert.ok(
  extractFunction('inspectLoginAuthState').includes("state: 'oauth_consent_page'"),
  'inspectLoginAuthState 应产出 oauth_consent_page 状态'
);

assert.ok(
  extractFunction('step6LoginFromPhonePage').includes('waitForStep6PhoneSubmitTransition(phoneSubmittedAt)'),
  '手机号登录提交后应使用手机号专用的后续状态等待逻辑'
);

assert.ok(
  extractFunction('step6_login').includes('return switchFromEmailPageToPhoneLogin(payload, snapshot);'),
  '本轮要求手机号登录时，邮箱输入页不能直接回退提交邮箱'
);

assert.ok(
  extractFunction('step6OpenLoginEntry').includes('return switchFromEmailPageToPhoneLogin(payload, nextSnapshot);'),
  '点击登录入口后若仍落到邮箱页，手机号登录链路应继续切换手机入口'
);

assert.ok(
  extractFunction('switchFromEmailPageToPhoneLogin').includes('waitForPhoneLoginEntrySwitchTransition()'),
  '点击“继续使用手机登录”后应等待页面离开旧邮箱页状态'
);

assert.ok(
  extractFunction('waitForPhoneLoginEntrySwitchTransition').includes("'email_page'"),
  '等待手机登录入口切换时不应立刻把旧邮箱页状态当成最终状态'
);

assert.ok(
  !/\?\s*\(currentSnapshot\.phoneEntryTrigger \|\| findLoginPhoneEntryTrigger\(\) \|\| currentSnapshot\.loginEntryTrigger/.test(extractFunction('step6OpenLoginEntry')),
  '本轮要求手机号登录时，入口页不能回退点击邮箱登录入口'
);

console.log('step6 login state tests passed');
