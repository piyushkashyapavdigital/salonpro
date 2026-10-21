'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from './review.module.css';

interface ReviewInfo {
  salon: { id: string; name: string; address: string };
  googleConfigured: boolean;
  googleReviewUrl: string | null;
  ratingPolicy: { googleMin: number; privateMax: number };
}

interface SubmitResult {
  ok: true;
  review: { id: string; rating: number; googleRedirected: boolean };
  googleReviewUrl: string | null;
  message: string;
}

interface DoneState {
  rating: number;
  googleUrl: string | null;
  message: string;
  copied: boolean;
  /** False when the browser blocked the new tab; the success card shows a link. */
  opened: boolean;
}

function errorFrom(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'message' in data && typeof (data as { message: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  return fallback;
}

/** Copy synchronously inside the click, so mobile browsers keep the gesture. */
function copyForGoogle(text: string): boolean {
  if (!text.trim()) return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (ok) return true;
  } catch {
    /* fall through to the async clipboard API */
  }
  return false;
}

/**
 * Open a blank tab inside the click, copy, then send that tab to Google.
 * Opening the tab synchronously avoids mobile pop-up blocking; awaiting the
 * clipboard afterwards keeps the "copied" message truthful.
 */
async function copyAndOpenGoogle(url: string, text: string): Promise<{ copied: boolean; opened: boolean }> {
  const win = window.open('about:blank', '_blank');
  if (win) win.opener = null;
  let copied = copyForGoogle(text);
  if (!copied && text.trim() && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  try {
    if (win) win.location.href = url;
  } catch {
    /* the customer closed the blank tab before the copy finished */
  }
  return { copied, opened: Boolean(win) };
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(Math.max(0, Math.min(5, rating)))}
      <span className={styles.starsEmpty}>{'☆'.repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

export default function ReviewPage() {
  const params = useParams<{ salonId: string }>();
  const salonId = typeof params?.salonId === 'string' ? params.salonId : '';

  const [info, setInfo] = useState<ReviewInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  useEffect(() => {
    if (!salonId) {
      setLoading(false);
      setLoadError('This review link is missing a salon.');
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/public/reviews/${encodeURIComponent(salonId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errorFrom(data, 'This review page is not available.'));
        if (!cancelled) setInfo(data as ReviewInfo);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this review page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [salonId]);

  useEffect(() => {
    if (info?.salon.name) document.title = `Review ${info.salon.name} · SalonPro`;
  }, [info?.salon.name]);

  const isPositive = rating >= 4;
  const canGoogle = Boolean(info?.googleConfigured && info.googleReviewUrl);
  const monogram = useMemo(() => {
    const words = (info?.salon.name ?? 'Salon')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    return words.map((word) => word[0]?.toUpperCase()).join('') || 'S';
  }, [info?.salon.name]);

  function selectRating(value: number) {
    setRating(value);
    setDone(null);
    setSubmitError(null);
  }

  async function submit(): Promise<SubmitResult> {
    const res = await fetch(`/api/public/reviews/${encodeURIComponent(salonId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rating,
        message: message.trim() || undefined,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(errorFrom(data, 'Your review could not be saved. Please try again.'));
    return data as SubmitResult;
  }

  async function sendPrivateFeedback() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await submit();
      setDone({
        rating,
        googleUrl: null,
        message: data.message,
        copied: false,
        opened: false,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Your feedback could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  function openGoogleAndSave() {
    if (!info?.googleReviewUrl) return;
    const url = info.googleReviewUrl;
    setSubmitError(null);
    setSubmitting(true);
    void (async () => {
      const { copied, opened } = await copyAndOpenGoogle(url, message);
      setDone({
        rating,
        googleUrl: url,
        message: copied
          ? 'Your words are copied. Paste them into Google’s review box.'
          : 'Google’s review form is open. Write your review there.',
        copied,
        opened,
      });
      try {
        await submit();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Your rating was not saved locally.');
      } finally {
        setSubmitting(false);
      }
    })();
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} aria-hidden="true" />
          <p>Loading the review page…</p>
        </div>
      </main>
    );
  }

  if (loadError || !info) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brandMark}>!</div>
          <h1 className={styles.title}>Review page unavailable</h1>
          <p className={styles.lede}>{loadError ?? 'This salon review page could not be found.'}</p>
        </div>
        <p className={styles.footer}>Powered by SalonPro</p>
      </main>
    );
  }

  if (done) {
    const positive = done.rating >= 4;
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brandMark}>{monogram}</div>
          <p className={styles.eyebrow}>{info.salon.name}</p>
          <div className={styles.successIcon} aria-hidden="true">✓</div>
          <h1 className={styles.title}>{positive ? 'Thank you!' : 'Thank you for being honest.'}</h1>
          <Stars rating={done.rating} />
          <p className={styles.lede}>
            {positive
              ? done.googleUrl
                ? !done.opened
                  ? done.copied
                    ? 'Your review is copied. The browser blocked the new tab — tap the button below to open Google and paste it.'
                    : 'Your rating is ready. Tap the button below to open Google’s review form.'
                  : done.copied
                    ? 'Your review is copied. Paste it into the Google review box and post it when you are ready.'
                    : 'Google’s review form is open in another tab. Write your review there when you are ready.'
                : 'Your rating is saved for the salon. Google reviews are not connected yet, so nothing was sent to Google.'
              : 'Your feedback is private. The salon can see it in SalonPro, but it was not sent to Google.'}
          </p>
          {done.googleUrl ? (
            <a className={styles.primaryButton} href={done.googleUrl} target="_blank" rel="noreferrer">
              {done.copied ? 'Open Google review again' : 'Open Google review'}
            </a>
          ) : null}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setDone(null);
              setRating(0);
              setMessage('');
              setSubmitError(null);
            }}
          >
            Rate another visit
          </button>
          {submitError ? <p className={styles.error}>{submitError}</p> : null}
        </div>
        <p className={styles.footer}>Powered by SalonPro · Your details are never posted automatically</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brandMark}>{monogram}</div>
        <p className={styles.eyebrow}>{info.salon.name}</p>
        <h1 className={styles.title}>How was your visit?</h1>
        <p className={styles.lede}>
          {info.salon.address ? `${info.salon.address} · ` : ''}Your feedback helps the salon do better.
        </p>

        <div className={styles.starPicker} role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              className={`${styles.starButton} ${rating >= value ? styles.starActive : ''}`}
              onClick={() => selectRating(value)}
            >
              ★
            </button>
          ))}
        </div>

        {rating > 0 ? (
          <>
            <div className={styles.ratingHint}>
              {isPositive ? (
                <>
                  <strong>Glad you enjoyed it.</strong> Write a few words, then we will copy them and open Google for you.
                </>
              ) : (
                <>
                  <strong>We are listening.</strong> This stays private with the salon and will not be posted to Google.
                </>
              )}
            </div>

            <label className={styles.label} htmlFor="review-message">
              {isPositive ? 'Your review' : 'What could we do better?'}
              <span className={styles.optional}>optional</span>
            </label>
            <textarea
              id="review-message"
              className={styles.textarea}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1500}
              rows={4}
              placeholder={
                isPositive
                  ? 'The haircut was exactly what I wanted, and the team made me feel welcome…'
                  : 'The wait was longer than expected, and I would have liked…'
              }
            />

            <div className={styles.fieldRow}>
              <div>
                <label className={styles.label} htmlFor="review-name">
                  Your name<span className={styles.optional}>optional</span>
                </label>
                <input
                  id="review-name"
                  className={styles.input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Asha"
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="review-phone">
                  Phone<span className={styles.optional}>optional</span>
                </label>
                <input
                  id="review-phone"
                  className={styles.input}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={30}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="For a follow-up"
                />
              </div>
            </div>

            {isPositive ? (
              canGoogle ? (
                <>
                  <button type="button" className={styles.primaryButton} onClick={openGoogleAndSave} disabled={submitting}>
                    {message.trim() ? 'Copy review & open Google' : 'Open Google review'}
                  </button>
                  <p className={styles.smallNote}>
                    Google does not let apps prefill review text. We copy your words so you can paste them into Google in one tap.
                  </p>
                </>
              ) : (
                <>
                  <div className={styles.infoBox}>
                    Google reviews are not connected for this salon yet. Your rating will be saved privately for the salon.
                  </div>
                  <button type="button" className={styles.primaryButton} onClick={() => void sendPrivateFeedback()} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Send feedback'}
                  </button>
                </>
              )
            ) : (
              <button type="button" className={styles.primaryButton} onClick={() => void sendPrivateFeedback()} disabled={submitting}>
                {submitting ? 'Saving…' : 'Send private feedback'}
              </button>
            )}

            {submitError ? <p className={styles.error}>{submitError}</p> : null}
            <p className={styles.smallNote}>
              {isPositive
                ? 'Only 4–5★ visits are offered the Google hand-off. 1–3★ feedback stays private.'
                : 'Nothing is posted automatically. The salon sees this in its private Reviews screen.'}
            </p>
          </>
        ) : (
          <p className={styles.pickHint}>Tap a star to begin.</p>
        )}
      </div>
      <p className={styles.footer}>Powered by SalonPro</p>
    </main>
  );
}
