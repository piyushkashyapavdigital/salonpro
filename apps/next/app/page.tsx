'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  Clock,
  CreditCard,
  LayoutGrid,
  Lock,
  Plus,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import styles from './landing.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.85, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Magnetic({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  return (
    <motion.div
      className={className}
      style={{ x: reduce ? 0 : sx, y: reduce ? 0 : sy }}
      onMouseMove={(event) => {
        if (reduce) return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(((event.clientX - rect.left) / rect.width - 0.5) * 14);
        y.set(((event.clientY - rect.top) / rect.height - 0.5) * 10);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** A card that follows the pointer with a soft clay light. */
function Spotlight({
  children,
  className = '',
  tone = 'clay',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'clay' | 'olive' | 'brass';
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`${styles.spotlight} ${styles[`tone_${tone}`]} ${className}`}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
      }}
    >
      {children}
    </div>
  );
}

function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  /* Start on the real number. If the observer never fires — a crawler, a
   * reduced-motion browser, a prerender — the page still tells the truth. */
  const [value, setValue] = useState(to);
  const started = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView || reduce || started.current) return;
    started.current = true;
    setValue(0);
    const controls = animate(0, to, {
      duration: 1.6,
      ease: EASE,
      onUpdate: (next) => setValue(Math.round(next)),
    });
    return () => controls.stop();
  }, [inView, reduce, to]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

function RotatingSeal() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={styles.seal}
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration: 24, ease: 'linear', repeat: Infinity }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120">
        <defs>
          <path id="sealCircle" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
        </defs>
        <text className={styles.sealText}>
          <textPath href="#sealCircle" startOffset="0">
            PRIVATE BY DEFAULT · ONLY THE SALON SEES IT ·
          </textPath>
        </text>
        <circle cx="60" cy="60" r="27" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <text x="60" y="66" textAnchor="middle" className={styles.sealStar}>
          ✳
        </text>
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The phone                                                           */
/* ------------------------------------------------------------------ */

function PhoneMock() {
  const reduce = useReducedMotion();
  return (
    <div className={styles.phoneWrap}>
      <div className={styles.phoneGlow} aria-hidden="true" />
      <div className={styles.phone}>
        <div className={styles.phoneNotch} aria-hidden="true" />
        <div className={styles.phoneScreen}>
          <div className={styles.phoneStatus}>
            <span>9:41</span>
            <span className={styles.phoneStatusIcons}>
              <span className={styles.signal} />
              <span className={styles.battery} />
            </span>
          </div>

          <div className={styles.phoneHead}>
            <div>
              <p className={styles.phoneEyebrow}>SAT · 12 OCT</p>
              <h3 className={styles.phoneHello}>
                Good evening,
                <br />
                <em>Piyush.</em>
              </h3>
            </div>
            <span className={styles.phoneBell}>
              <Bell size={14} strokeWidth={1.8} />
            </span>
          </div>

          <div className={styles.phoneWallet}>
            <span className={styles.phoneLabel}>WALLET</span>
            <div className={styles.phoneWalletRow}>
              <strong>₹2,400</strong>
              <span className={styles.phoneTopUp}>
                <Plus size={11} /> Top up
              </span>
            </div>
            <p>₹1,900 purchased · ₹500 bonus</p>
          </div>

          <div className={styles.phoneTicket}>
            <div className={styles.phoneTicketTop}>
              <span>NEXT VISIT</span>
              <span>16:30</span>
            </div>
            <p className={styles.phoneTicketTitle}>Cut &amp; finish</p>
            <p className={styles.phoneTicketMeta}>with Ritu · 60 min · ₹850</p>
          </div>

          <div className={styles.phoneActions}>
            {[
              { icon: Scissors, label: 'Book' },
              { icon: Wallet, label: 'Wallet' },
              { icon: Star, label: 'Reviews' },
              { icon: Users, label: 'Refer' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className={styles.phoneAction}>
                <span>
                  <Icon size={15} strokeWidth={1.7} />
                </span>
                <small>{label}</small>
              </div>
            ))}
          </div>

          <div className={styles.phoneOffer}>
            <div className={styles.phoneOfferTop}>
              <span>GOLD CARD</span>
              <span>3 VISITS TO GO</span>
            </div>
            <div className={styles.phoneOfferBar}>
              <i />
            </div>
          </div>

          <div className={styles.phoneTabs} aria-hidden="true">
            <span className={styles.phoneTabActive}>
              <LayoutGrid size={14} />
            </span>
            <span>
              <CalendarDays size={14} />
            </span>
            <span>
              <Wallet size={14} />
            </span>
            <span>
              <Users size={14} />
            </span>
          </div>
        </div>
      </div>

      <RotatingSeal />

      <motion.div
        className={styles.floatCard}
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
      >
        <div className={styles.floatStars} aria-hidden="true">
          {'★★★★★'}
        </div>
        <p>Saved to your visit</p>
        <small>
          <Lock size={10} /> Not posted publicly
        </small>
      </motion.div>

      <motion.div
        className={styles.floatChip}
        animate={reduce ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity, delay: 0.8 }}
      >
        <span className={styles.floatChipDot} />
        Walk-in added
        <small>2 min ago</small>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rating demo                                                         */
/* ------------------------------------------------------------------ */

function RatingDemo() {
  const [rating, setRating] = useState(5);
  const positive = rating >= 4;
  return (
    <div className={styles.ratingDemo}>
      <p className={styles.ratingDemoLabel}>TRY IT — TAP A STAR</p>
      <div className={styles.ratingStars} role="radiogroup" aria-label="Demo rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} stars`}
            className={rating >= value ? styles.ratingStarActive : styles.ratingStar}
            onClick={() => setRating(value)}
          >
            ★
          </button>
        ))}
      </div>
      <div className={styles.ratingDemoResult}>
        <AnimatePresence mode="wait">
          <motion.div
            key={positive ? 'public' : 'private'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <strong>{positive ? 'A Google hand-off appears.' : 'Stays between you and the salon.'}</strong>
            <p>
              {positive
                ? 'Only when the salon has connected its Google profile. The review is still saved to the visit.'
                : 'No public post. No Google tab. The team sees it in its private Reviews screen, with the visit attached.'}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const ROOMS = [
  {
    index: '01',
    title: 'The client',
    copy: 'A quiet home for the next visit, the wallet, the offers and the feedback they would rather not post in public.',
    points: ['Book in a few taps', 'Wallet, referrals & loyalty', 'Review the visit that happened'],
  },
  {
    index: '02',
    title: 'The salon',
    copy: 'The front desk, the floor and the books in one place. Walk-ins, schedules, payments and the numbers that actually reconcile.',
    points: ['Today, at a glance', 'Walk-ins without the scramble', 'Private reviews, named visits'],
  },
  {
    index: '03',
    title: 'The platform',
    copy: 'Every salon on the server, with the audit trail to prove who changed what. Built for the person who answers when something breaks.',
    points: ['Salons & vendors', 'Audit log, not guesswork', 'Suspend and restore safely'],
  },
];

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'The day, in one screen',
    copy: 'Booked, completed, cancelled, walked in. The front desk stops counting on its fingers.',
    tone: 'clay' as const,
    span: 'wide',
  },
  {
    icon: Lock,
    title: 'Private reviews',
    copy: 'A signed link per visit. The salon knows who said it. Nobody else does.',
    tone: 'olive' as const,
    span: '',
  },
  {
    icon: Wallet,
    title: 'Wallet & referrals',
    copy: 'Top-ups, bonus balances and rewards that reconcile to the rupee.',
    tone: 'brass' as const,
    span: '',
  },
  {
    icon: Plus,
    title: 'Walk-ins',
    copy: 'Add a chair, a service and a stylist before the kettle boils.',
    tone: 'clay' as const,
    span: '',
  },
  {
    icon: TrendingUp,
    title: 'Numbers you can defend',
    copy: 'Revenue, retention and top customers, computed by the server — not estimated by the phone.',
    tone: 'olive' as const,
    span: '',
  },
  {
    icon: ShieldCheck,
    title: 'Honest connections',
    copy: 'If SMS, payments or WhatsApp are not connected, the app says so instead of pretending.',
    tone: 'brass' as const,
    span: 'wide',
  },
];

const TICKER = ['CLIENTS', 'OWNERS', 'MANAGERS', 'RECEPTION', 'PLATFORM'];

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const phoneRotate = useTransform(scrollYProgress, [0, 1], [0, -3]);
  const { scrollYProgress: pageProgress } = useScroll();
  const progress = useSpring(pageProgress, { stiffness: 120, damping: 28, mass: 0.3 });
  const [navSolid, setNavSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={styles.page}>
      <motion.div className={styles.progress} style={{ scaleX: progress }} aria-hidden="true" />

      <header className={`${styles.nav} ${navSolid ? styles.navSolid : ''}`}>
        <div className={`${styles.navInner} container`}>
          <a href="#top" className={styles.wordmark} aria-label="SalonPro home">
            SalonPro<span className={styles.wordmarkDot} />
          </a>
          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#system">The system</a>
            <a href="#product">Product</a>
            <a href="#private">Reviews</a>
            <a href="#how">How it works</a>
          </nav>
          <a href="#get" className={styles.navCta}>
            Get SalonPro
            <ArrowUpRight size={14} />
          </a>
        </div>
      </header>

      <main id="top">
        {/* ---------------------------------------------------------- */}
        {/* Hero                                                       */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.hero} ref={heroRef}>
          <div className={`${styles.heroInner} container`}>
            <div className={styles.heroCopy}>
              <Reveal>
                <p className={styles.heroEyebrow}>
                  <span className={styles.asterisk} aria-hidden="true">
                    ✳
                  </span>
                  The salon operating system
                </p>
              </Reveal>

              <Reveal delay={0.06}>
                <h1 className={styles.heroTitle}>
                  Every chair.
                  <br />
                  One <em>quiet</em> app.
                </h1>
              </Reveal>

              <Reveal delay={0.14}>
                <p className={styles.heroLede}>
                  Bookings, walk-ins, wallets, private reviews and the numbers that matter — one considered app for the
                  client, the salon and the platform behind it.
                </p>
              </Reveal>

              <Reveal delay={0.2}>
                <div className={styles.heroActions}>
                  <Magnetic>
                    <a href="#product" className={styles.primaryCta}>
                      Explore the system
                      <span className={styles.ctaArrow}>
                        <ArrowRight size={15} />
                      </span>
                    </a>
                  </Magnetic>
                  <a href="#private" className={styles.textCta}>
                    Why reviews stay private
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </Reveal>

              <Reveal delay={0.28}>
                <div className={styles.heroFacts}>
                  <span>3 workspaces</span>
                  <span className={styles.factDot} aria-hidden="true" />
                  <span>1 login</span>
                  <span className={styles.factDot} aria-hidden="true" />
                  <span>0 spreadsheets</span>
                </div>
              </Reveal>
            </div>

            <motion.div className={styles.heroVisual} style={{ y: phoneY, rotate: phoneRotate }}>
              <PhoneMock />
            </motion.div>
          </div>

          <div className={styles.ticker} aria-hidden="true">
            <div className={styles.tickerTrack}>
              {[0, 1].map((copy) => (
                <div className={styles.tickerGroup} key={copy}>
                  {TICKER.map((word) => (
                    <span key={`${copy}-${word}`} className={styles.tickerItem}>
                      {word}
                      <span className={styles.tickerStar}>✳</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Three rooms                                                */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.rooms} id="system">
          <div className="container">
            <div className={styles.sectionHead}>
              <Reveal>
                <p className={styles.sectionKicker}>
                  <span>01</span> One app, three rooms
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className={styles.sectionTitle}>
                  The whole salon,
                  <br />
                  <em>without the seams.</em>
                </h2>
              </Reveal>
              <Reveal delay={0.14}>
                <p className={styles.sectionLede}>
                  One binary. The server decides which room you walk into — and checks the permission again on every
                  request, not just at the door.
                </p>
              </Reveal>
            </div>

            <div className={styles.roomGrid}>
              {ROOMS.map((room, index) => (
                <Reveal key={room.index} delay={index * 0.08}>
                  <Spotlight className={styles.roomCard} tone={index === 0 ? 'clay' : index === 1 ? 'olive' : 'brass'}>
                    <div className={styles.roomTop}>
                      <span className={styles.roomIndex}>{room.index}</span>
                      <span className={styles.roomGlyph} aria-hidden="true">
                        {index === 0 ? <Smartphone size={18} /> : index === 1 ? <Store size={18} /> : <LayoutGrid size={18} />}
                      </span>
                    </div>
                    <h3 className={styles.roomTitle}>{room.title}</h3>
                    <p className={styles.roomCopy}>{room.copy}</p>
                    <ul className={styles.roomPoints}>
                      {room.points.map((point) => (
                        <li key={point}>
                          <Check size={12} strokeWidth={2.4} />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <span className={styles.roomArrow} aria-hidden="true">
                      <ArrowUpRight size={16} />
                    </span>
                  </Spotlight>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Product bento                                              */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.product} id="product">
          <div className="container">
            <div className={styles.sectionHeadSplit}>
              <Reveal>
                <p className={styles.sectionKicker}>
                  <span>02</span> The day, considered
                </p>
                <h2 className={styles.sectionTitle}>
                  Everything the day needs.
                  <br />
                  <em>Nothing it doesn’t.</em>
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className={styles.sectionLede}>
                  Not a dashboard bolted to a booking form. Each screen answers a question someone actually asks at 4pm
                  on a Saturday.
                </p>
              </Reveal>
            </div>

            <div className={styles.bento}>
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Reveal
                    key={feature.title}
                    delay={index * 0.05}
                    className={`${styles.bentoCell} ${feature.span === 'wide' ? styles.bentoWide : ''}`}
                  >
                    <Spotlight className={styles.bentoCard} tone={feature.tone}>
                      <div className={styles.bentoIcon}>
                        <Icon size={17} strokeWidth={1.8} />
                      </div>
                      <h3>{feature.title}</h3>
                      <p>{feature.copy}</p>
                      {index === 0 ? (
                        <div className={styles.miniSchedule} aria-hidden="true">
                          {[
                            ['10:30', 'Aarav · Cut & finish', 'Confirmed'],
                            ['11:15', 'Meera · Colour', 'In chair'],
                            ['12:00', 'Walk-in · Beard', 'Added'],
                          ].map(([time, what, status], row) => (
                            <div key={time} className={styles.miniRow}>
                              <span className={styles.miniTime}>{time}</span>
                              <span className={styles.miniWhat}>{what}</span>
                              <span className={`${styles.miniStatus} ${row === 1 ? styles.miniStatusLive : ''}`}>{status}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {index === 1 ? (
                        <div className={styles.miniReview}>
                          <span className={styles.miniReviewStars} aria-hidden="true">
                            ★★★★★
                          </span>
                          <p>“Exactly the cut I asked for.”</p>
                          <small>Piyush · 19 Oct · private to the salon</small>
                        </div>
                      ) : null}
                      {index === 2 ? (
                        <div className={styles.miniWallet}>
                          <div className={styles.miniWalletTop}>
                            <span>BALANCE</span>
                            <strong>₹2,400</strong>
                          </div>
                          <div className={styles.miniWalletBar} aria-hidden="true">
                            <i />
                          </div>
                          <small>₹500 bonus · 3 referrals</small>
                        </div>
                      ) : null}
                      {index === 3 ? (
                        <div className={styles.miniAdd}>
                          <span aria-hidden="true">＋</span> Add a walk-in
                          <small>under 30s</small>
                        </div>
                      ) : null}
                      {index === 4 ? (
                        <div className={styles.miniBars} aria-hidden="true">
                          {[38, 62, 48, 76, 58, 92, 70].map((bar, barIndex) => (
                            <i key={barIndex} style={{ height: `${bar}%` }} />
                          ))}
                        </div>
                      ) : null}
                      {index === 5 ? (
                        <div className={styles.connectionStrip} aria-hidden="true">
                          <span className={styles.connectionOn}>SMS · on</span>
                          <span className={styles.connectionOn}>UPI · on</span>
                          <span className={styles.connectionOff}>WhatsApp · off</span>
                        </div>
                      ) : null}
                    </Spotlight>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Private reviews                                            */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.private} id="private">
          <div className={`${styles.privateInner} container`}>
            <div className={styles.privateCopy}>
              <Reveal>
                <p className={`${styles.sectionKicker} ${styles.kickerLight}`}>
                  <span>03</span> Private by default
                </p>
              </Reveal>
              <Reveal delay={0.06}>
                <h2 className={`${styles.sectionTitle} ${styles.titleLight}`}>
                  A five-star feeling,
                  <br />
                  <em>kept in the room.</em>
                </h2>
              </Reveal>
              <Reveal delay={0.12}>
                <p className={`${styles.sectionLede} ${styles.ledeLight}`}>
                  The review link is signed to a real completed visit. The page knows who is writing — so it never asks
                  for a name or a phone number, and the feedback never appears on a public wall.
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <ul className={styles.privateList}>
                  <li>
                    <Lock size={15} />
                    <div>
                      <strong>Only the salon sees it.</strong>
                      <span>Owner and manager. Reception does not. Clients never do.</span>
                    </div>
                  </li>
                  <li>
                    <ShieldCheck size={15} />
                    <div>
                      <strong>Signed, single-use links.</strong>
                      <span>A tampered token is refused; a visit can only be reviewed once.</span>
                    </div>
                  </li>
                  <li>
                    <Star size={15} />
                    <div>
                      <strong>4–5★ may go to Google.</strong>
                      <span>Only when the salon has connected a profile. 1–3★ stays private, always.</span>
                    </div>
                  </li>
                </ul>
              </Reveal>
            </div>

            <Reveal delay={0.16} className={styles.privateCardWrap}>
              <div className={styles.reviewCard}>
                <div className={styles.reviewCardTop}>
                  <span className={styles.reviewSalon}>SALON PRO · MAIN BRANCH</span>
                  <span className={styles.reviewLock}>
                    <Lock size={11} /> Private
                  </span>
                </div>
                <h3 className={styles.reviewHeading}>How was your visit?</h3>
                <p className={styles.reviewSub}>Reviewing as Piyush · 19 Oct</p>
                <RatingDemo />
                <div className={styles.reviewFoot}>
                  <span className={styles.reviewAvatar}>P</span>
                  <span>
                    <strong>Piyush AS Customer</strong>
                    <small>86••••18 · Completed visit</small>
                  </span>
                  <span className={styles.reviewVerified}>
                    <Check size={10} /> Verified
                  </span>
                </div>
              </div>
              <div className={styles.reviewShadowCard} aria-hidden="true" />
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Numbers                                                    */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.numbers}>
          <div className={`${styles.numbersInner} container`}>
            {[
              { value: 3, suffix: '', label: 'workspaces, one binary' },
              { value: 12, suffix: '', label: 'modules on the same ledger' },
              { value: 0, suffix: '', label: 'review fields to fill in' },
              { value: 1, suffix: '', label: 'place the whole day lives' },
            ].map((stat, index) => (
              <Reveal key={stat.label} delay={index * 0.06} className={styles.numberCell}>
                <span className={styles.numberValue}>
                  <Counter to={stat.value} suffix={stat.suffix} />
                </span>
                <span className={styles.numberLabel}>{stat.label}</span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* How it works                                               */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.how} id="how">
          <div className="container">
            <div className={styles.sectionHead}>
              <Reveal>
                <p className={styles.sectionKicker}>
                  <span>04</span> How it works
                </p>
              </Reveal>
              <Reveal delay={0.06}>
                <h2 className={styles.sectionTitle}>
                  One login.
                  <br />
                  <em>The room finds you.</em>
                </h2>
              </Reveal>
            </div>

            <div className={styles.steps}>
              {[
                {
                  n: 'I',
                  title: 'Sign in with a phone',
                  copy: 'A one-time code, no password. New clients are created on the first verified sign-in.',
                  icon: Smartphone,
                },
                {
                  n: 'II',
                  title: 'The server picks the room',
                  copy: 'Client, salon or platform — from the role on your session. Every request re-checks the permission.',
                  icon: ShieldCheck,
                },
                {
                  n: 'III',
                  title: 'The day runs itself',
                  copy: 'Bookings, walk-ins, wallets and reviews land on the same ledger. The numbers stay honest.',
                  icon: Clock,
                },
              ].map((step, index) => {
                const Icon = step.icon;
                return (
                  <Reveal key={step.n} delay={index * 0.08}>
                    <div className={styles.step}>
                      <div className={styles.stepTop}>
                        <span className={styles.stepNumber}>{step.n}</span>
                        <Icon size={18} strokeWidth={1.6} />
                      </div>
                      <h3>{step.title}</h3>
                      <p>{step.copy}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={0.1}>
              <blockquote className={styles.quote}>
                “The best software is the kind your team
                <br />
                <em>stops noticing.</em>”
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* CTA                                                        */}
        {/* ---------------------------------------------------------- */}
        <section className={styles.get} id="get">
          <div className={`${styles.getInner} container`}>
            <Reveal>
              <p className={styles.getEyebrow}>
                <span className={styles.asterisk} aria-hidden="true">
                  ✳
                </span>
                Ready when the first client walks in
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className={styles.getTitle}>
                Bring the whole salon
                <br />
                <em>into one place.</em>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <div className={styles.getActions}>
                <Magnetic>
                  <a className={styles.primaryCta} href="mailto:hello@salonpro.app?subject=SalonPro">
                    Talk to us
                    <span className={styles.ctaArrow}>
                      <ArrowRight size={15} />
                    </span>
                  </a>
                </Magnetic>
                <a className={styles.getSecondary} href="#system">
                  Walk through the product
                  <ArrowUpRight size={14} />
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <p className={styles.getNote}>Android today · built for one-handed use on the salon floor</p>
            </Reveal>

            <div className={styles.getMarks} aria-hidden="true">
              <span>
                <Sparkles size={13} /> Private reviews
              </span>
              <span>
                <CreditCard size={13} /> UPI &amp; cards
              </span>
              <span>
                <Users size={13} /> Walk-ins
              </span>
              <span>
                <Clock size={13} /> Reminders
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.footerInner} container`}>
          <div className={styles.footerBrand}>
            <span className={styles.footerWordmark}>
              SalonPro<span className={styles.wordmarkDot} />
            </span>
            <p>Made for the people who make people feel good.</p>
          </div>
          <div className={styles.footerCols}>
            <div>
              <span className={styles.footerHead}>Product</span>
              <a href="#system">The system</a>
              <a href="#product">Features</a>
              <a href="#private">Reviews</a>
            </div>
            <div>
              <span className={styles.footerHead}>Company</span>
              <a href="#how">How it works</a>
              <a href="mailto:hello@salonpro.app">Contact</a>
            </div>
            <div>
              <span className={styles.footerHead}>On the phone</span>
              <span className={styles.footerMuted}>Android · 2.x</span>
              <span className={styles.footerMuted}>Signed updates</span>
            </div>
          </div>
        </div>
        <div className={`${styles.footerBase} container`}>
          <span>© 2026 SalonPro</span>
          <span className={styles.footerBaseNote}>
            <Lock size={10} /> Reviews are private by design
          </span>
        </div>
      </footer>
    </div>
  );
}
