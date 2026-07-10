(function () {
  const DEFAULT_ENDPOINT = '/api/v1/sheets/submit';
  const LEGACY_ENDPOINT = '/api/sheets/submit';
  const NETLIFY_FUNCTION_ENDPOINT = '/.netlify/functions/sheets-submit';
  // For a frontend-only deployment with a separate backend, set this once:
  // const DEPLOYED_BACKEND_ORIGIN = 'https://your-adya-forms-backend.com';
  const DEPLOYED_BACKEND_ORIGIN = '';
  const ALLOWED_SHEETS = new Set(['colleges', 'builders', 'demos', 'gio']);

  function configuredEndpoint() {
    return configuredEndpoints()[0];
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function endpointFromBackendOrigin(origin) {
    const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
    if (!cleanOrigin) return '';
    return `${cleanOrigin}${DEFAULT_ENDPOINT}`;
  }

  function configuredEndpoints() {
    const meta = document.querySelector('meta[name="adya-sheets-endpoint"]');
    const backendOrigin = window.ADYA_FORMS_BACKEND_URL || DEPLOYED_BACKEND_ORIGIN;
    const value = (window.ADYA_SHEETS_ENDPOINT || meta?.content || endpointFromBackendOrigin(backendOrigin) || '').trim();
    if (value) return [value];

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      const protocol = window.location.protocol || 'http:';
      const currentPort = window.location.port || '';
      if (currentPort === '8888' || currentPort === '8899') {
        return unique([
          DEFAULT_ENDPOINT,
          LEGACY_ENDPOINT,
          NETLIFY_FUNCTION_ENDPOINT
        ]);
      }
      return unique([
        `${protocol}//localhost:8787${DEFAULT_ENDPOINT}`,
        `${protocol}//localhost:8787${LEGACY_ENDPOINT}`,
        `${protocol}//localhost:8888${DEFAULT_ENDPOINT}`,
        `${protocol}//localhost:8888${LEGACY_ENDPOINT}`,
        `${protocol}//localhost:8888${NETLIFY_FUNCTION_ENDPOINT}`,
        DEFAULT_ENDPOINT,
        LEGACY_ENDPOINT,
        `${protocol}//localhost:8899${DEFAULT_ENDPOINT}`,
        `${protocol}//localhost:8899${LEGACY_ENDPOINT}`,
        `${protocol}//localhost:8899${NETLIFY_FUNCTION_ENDPOINT}`
      ]);
    }

    return [DEFAULT_ENDPOINT];
  }

  function normalizeKey(key) {
    return String(key || '')
      .trim()
      .replace(/^df-/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  function appendValue(target, key, value) {
    if (!key) return;
    if (value instanceof File) return;
    const cleanValue = typeof value === 'string' ? value.trim() : value;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = [target[key], cleanValue].flat().filter(Boolean).join(', ');
    } else {
      target[key] = cleanValue;
    }
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((value, key) => {
      appendValue(data, normalizeKey(key), value);
    });
    return data;
  }

  function fieldData(ids) {
    const data = {};
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = normalizeKey(el.name || id);
      appendValue(data, key, el.value || '');
    });
    return data;
  }

  function enrichData(data) {
    const payload = { ...data };
    if (!payload.page_title) payload.page_title = document.title || '';
    return payload;
  }

  async function submit(sheet, data, options) {
    const cleanSheet = String(sheet || '').trim().toLowerCase();
    if (!ALLOWED_SHEETS.has(cleanSheet)) {
      throw new Error('Unknown form destination.');
    }

    const requestBody = JSON.stringify({
        sheet: cleanSheet,
        data: enrichData(data || {}),
        form_name: options && options.formName ? options.formName : '',
        source_page: window.location.pathname || '/',
        page_url: window.location.href || ''
      });

    let response;
    let payload = {};
    let lastError;

    for (const endpoint of configuredEndpoints()) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        });
        try {
          payload = await response.json();
        } catch (_error) {
          payload = {};
        }

        if (response.ok && payload.ok) return payload;

        lastError = new Error(payload.error || `Form endpoint returned ${response.status}.`);
        if (![404, 405].includes(response.status)) break;
      } catch (error) {
        lastError = error;
      }
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      throw new Error('Form service is not running. Start it with npm run dev:sheets from adya-website, then submit again.');
    }
    throw new Error(lastError?.message || 'Unable to submit form.');
  }

  function setButtonLoading(button, label) {
    if (!button) return function noop() {};
    const original = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = label || 'Sending...';
    let restored = false;
    return function restore() {
      if (restored) return;
      restored = true;
      button.innerHTML = original;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (window.lucide) window.lucide.createIcons();
    };
  }

  async function submitForm(form, options) {
    return submit(options.sheet, formData(form), options);
  }

  async function submitDemoForm(eventOrButton) {
    if (eventOrButton && typeof eventOrButton.preventDefault === 'function') {
      eventOrButton.preventDefault();
    }

    const form = eventOrButton && eventOrButton.target && eventOrButton.target.tagName === 'FORM'
      ? eventOrButton.target
      : document.querySelector('#demo-modal form, #global-demo-form');
    const button = form
      ? form.querySelector('[type="submit"], button:not([type]), button[type="button"]')
      : ((eventOrButton && eventOrButton.currentTarget) || window.event?.target);

    const data = form ? formData(form) : fieldData(['df-fname', 'df-lname', 'df-name', 'df-email', 'df-company', 'df-firm', 'df-role', 'df-solution', 'df-time', 'df-queries', 'df-notes']);
    const name = data.name || [data.fname, data.lname].filter(Boolean).join(' ');
    if (name) data.name = name;

    if (!data.name && !data.fname) {
      throw new Error('Please fill in your name.');
    }
    if (!data.email) {
      throw new Error('Please fill in your email.');
    }

    const restore = setButtonLoading(button, '<span class="font-mono text-[13px]">Sending...</span>');
    try {
      await submit('demos', data, { formName: 'demo' });
      return { data, restore };
    } catch (error) {
      restore();
      throw error;
    }
  }

  window.AdyaSheets = {
    endpoint: configuredEndpoint,
    endpoints: configuredEndpoints,
    fieldData,
    formData,
    setButtonLoading,
    submit,
    submitDemoForm,
    submitForm
  };

  document.addEventListener('submit', async function (event) {
    const form = event.target;
    if (!form || !form.matches('[data-adya-sheet]')) return;

    event.preventDefault();
    const status = form.querySelector('[data-adya-form-status]');
    const restore = setButtonLoading(form.querySelector('[type="submit"]'), 'Sending...');

    try {
      const data = formData(form);
      await submit(form.getAttribute('data-adya-sheet'), data, {
        formName: form.getAttribute('data-adya-form-name') || form.id || 'form'
      });
      if (status) {
        status.style.color = '#7EE7A8';
        status.textContent = 'Thanks. We will be in touch shortly.';
      }
      form.reset();
    } catch (error) {
      if (status) {
        status.style.color = '#FFB4A8';
        status.textContent = error.message || 'Could not submit right now. Please try again.';
      } else {
        alert(error.message || 'Could not submit right now. Please try again.');
      }
    } finally {
      restore();
    }
  });
})();
