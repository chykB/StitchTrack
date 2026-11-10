import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import styles from "./page.module.css";
import LegalDocumentsDialog from "./LegalDocumentsDialog";

// Local assessment origin only. No public deployment URL is approved.
export const metadata: Metadata = {
  title: "StitchTrack | Tailoring orders and agreements",
  description:
    "StitchTrack is a tailoring order and agreement management platform for small fashion studios in Nigeria.",
  metadataBase: new URL("http://127.0.0.1:3000"),
  openGraph: {
    type: "website",
    title: "StitchTrack | Tailoring orders and agreements",
    description: "Order and agreement management for Nigerian tailoring studios",
    siteName: "StitchTrack",
    url: "/",
    images: [{
      url: "/stitchtrack-og.png",
      width: 1200,
      height: 630,
      alt: "StitchTrack - tailoring orders and agreements",
    }],
  },
};

// Static homepage-only sample records, independent of authentication and business data.
const sampleOrders = [
  {client:"Amina Bello",garment:"Midi dress",agreement:"v2 · Awaiting approval",progress:"In progress",date:"18 Nov",isoDate:"2026-11-18",approved:false},
  {client:"Chidi Okoro",garment:"Two-piece set",agreement:"v1 · Approved",progress:"Fitting next",date:"21 Nov",isoDate:"2026-11-21",approved:true},
];
const iconPaths = {
  layers:"m12 3 10 6-10 6L2 9Zm-9 10 9 6 9-6M3 17l9 6 9-6",
  changes:"M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
  people:"M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9-1a2.5 2.5 0 1 0 0-5M2 21v-3a5 5 0 0 1 10 0v3m3-7a5 5 0 0 1 7 4v3",
  ruler:"m3 17 14-14 5 5L8 22Zm3-3 3 3m0-6 3 3m0-6 3 3m0-6 3 3",
  document:"M14 3H5v19h14V8Zm0 0v6h5M8 12h7m-7 4h4m4 3 2 2 4-5",
  parcel:"m3 7 9-5 9 5v12l-9 5-9-5Zm0 0 9 5 9-5M12 12v12M7 4l10 6",
  calendar:"M5 3v5m14-5v5M3 10h18M3 6h18v16H3Z",
  home:"m3 11 9-8 9 8M5 9v13h5v-7h4v7h5V9",
  card:"M3 5h18v15H3Zm0 5h18M6 16h4",
  clock:"M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
};
function Icon({name}:{name:keyof typeof iconPaths}) {
  return <svg viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={iconPaths[name]}/></svg>;
}

export default async function HomePage() {
  const documentsDirectory = join(process.cwd(), "task-03-client-validation", "docs");
  const [terms, privacy] = await Promise.all([
    readFile(join(documentsDirectory, "platform-terms-draft.md"), "utf8"),
    readFile(join(documentsDirectory, "privacy-policy-draft.md"), "utf8"),
  ]);

  return <>
    <main id="main" data-marketing-home className={styles.main} tabIndex={-1}>
      <section className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>For tailors &amp; fashion studios <span aria-hidden="true"/></p>
          <h1 id="page-title" className={styles.title}>Your craft deserves more than scattered records.</h1>
          <p className={styles.description}>StitchTrack is designed to help independent tailors and fashion studios keep measurements, garment details, client agreements and delivery plans together.</p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href="/auth?signup">Create a tailor account</a>
            <a className={styles.textAction} href="#how-it-works">See how it works <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <figure className={styles.heroVisual} aria-labelledby="hero-sample-label">
          {/* Original generated photographic asset; provenance in public/images/README.md. */}
          <img className={styles.heroPhoto} src="/images/atelier-hero.webp" width="1400" height="933" alt="Burgundy dress form with a measuring tape beside thread spools and tailoring scissors" fetchPriority="high"/>
          <figcaption className={styles.sampleCard}>
            <span id="hero-sample-label" className={styles.demoLabel}>Sample order</span>
            <div className={styles.sampleTitle}><strong>Midi dress · Amina Bello</strong><span className={styles.awaiting}><Icon name="clock"/> Awaiting approval</span></div>
            <div className={styles.sampleMeta}><span><Icon name="document"/> Agreement v2</span><span><Icon name="calendar"/> Delivery 18 Nov</span></div>
          </figcaption>
        </figure>
      </section>

      <section className={styles.challenge} aria-labelledby="challenge-title">
        <p className={styles.eyebrow}>The challenge</p>
        <h2 id="challenge-title" className={styles.sectionTitle}>Beautiful work needs clear communication.</h2>
        <p className={styles.sectionIntro}>Keeping track of orders, changes and client expectations can be hard when details live in different places.</p>
        <div className={styles.challengeCards}>
          <article><span className={styles.iconTile}><Icon name="layers"/></span><div><h3>Details in too many places</h3><p>Measurements in a notebook.<br/>Style references in a chat.</p></div></article>
          <article><span className={styles.iconTile}><Icon name="changes"/></span><div><h3>Changes can get messy</h3><p>Price updates, new styles or delivery dates are hard to track.</p></div></article>
          <article><span className={styles.iconTile}><Icon name="people"/></span><div><h3>Different expectations</h3><p>Without a clear agreement, you and your client can remember the same details differently.</p></div></article>
        </div>
      </section>

      <section id="how-it-works" className={styles.workflow} aria-labelledby="workflow-title">
        <p className={styles.eyebrow}>How StitchTrack works</p>
        <h2 id="workflow-title" className={styles.sectionTitle}>From first measurement to final delivery.</h2>
        <ol className={styles.steps}>
          <li><span className={styles.iconTile}><Icon name="ruler"/></span><h3>01. Capture the details</h3><p>Keep garments, measurements, fabrics and style references organized.</p></li>
          <li><span className={styles.iconTile}><Icon name="document"/></span><h3>02. Agree with confidence</h3><p>Give clients a clear way to review proposals and approve important changes.</p></li>
          <li><span className={styles.iconTile}><Icon name="parcel"/></span><h3>03. Keep work moving</h3><p>Track fittings, record payments and delivery progress in one place.</p></li>
        </ol>
      </section>

      <section id="workspace-preview" className={styles.workspaceSection} aria-labelledby="workspace-title">
        <div className={styles.workspaceCopy}>
          <p className={styles.eyebrow}>Workspace preview</p>
          <h2 id="workspace-title" className={styles.sectionTitle}>Every detail, connected to the garment.</h2>
          <p>A clear view of what was requested, what’s been agreed and what happens next.</p>
        </div>
        <figure className={styles.workspace} aria-labelledby="workspace-caption">
          <div className={styles.sidebar} aria-hidden="true">
            <div className={styles.miniBrand}><span>ST</span> StitchTrack</div>
            <div className={styles.activeItem}><Icon name="home"/> Orders</div>
            <div><Icon name="people"/> Clients</div>
            <div><Icon name="ruler"/> Measurements</div>
            <div><Icon name="document"/> Agreements</div>
            <div><Icon name="card"/> Payments</div>
          </div>
          <div className={styles.orderPanel}>
            <figcaption id="workspace-caption" className={styles.workspaceCaption}><strong>Orders</strong><span className={styles.demoLabel}>Sample data</span><span className={styles.newOrder} aria-hidden="true">＋ New order</span></figcaption>
            <table className={styles.orderTable}>
              <caption className={styles.visuallyHidden}>Fictional garment orders. Static preview of planned features, not a live dashboard.</caption>
              <thead><tr><th scope="col">Garment</th><th scope="col" className={styles.clientColumn}>Client</th><th scope="col">Agreement</th><th scope="col" className={styles.progressColumn}>Progress</th><th scope="col">Delivery</th></tr></thead>
              <tbody>{sampleOrders.map(order=><tr key={order.client}>
                <th scope="row"><span className={styles.garmentCell}><span className={order.approved?styles.tanGarment:styles.wineGarment} aria-hidden="true"><svg viewBox="0 0 30 42"><path d={order.approved?"M9 3h12l4 9-5 3-1-5v13H11V10l-1 5-5-3ZM11 25h8l3 15h-6l-1-9-1 9H8Z":"M10 3h10l4 8-5 2-1-4v10l6 21H6l6-21V9l-1 4-5-2Z"}/></svg></span><span>{order.garment}<span className={styles.mobileClient}>{order.client}<span className={styles.mobileProgress}><span className={styles.progressBadge}>{order.progress}</span></span></span></span></span></th>
                <td className={styles.clientColumn}>{order.client}</td><td><span className={order.approved?styles.approved:styles.awaiting}>{order.agreement}</span></td><td className={styles.progressColumn}><span className={styles.progressBadge}>{order.progress}</span></td><td><time dateTime={order.isoDate}>{order.date}</time></td>
              </tr>)}</tbody>
            </table>
          </div>
        </figure>
      </section>

      <section className={styles.closing} aria-labelledby="start-title">
        <div><h2 id="start-title" className={styles.sectionTitle}>Spend more time creating.<br/>Less time searching.</h2><p>Create your StitchTrack account and get started with your tailoring workspace.</p></div>
        <div className={styles.actions}><a className={styles.primaryAction} href="/auth?signup">Create a tailor account</a><a className={styles.textAction} href="/auth?login">Log in <span aria-hidden="true">→</span></a></div>
      </section>
    </main>
    <footer className={styles.footer}><a className="brand" href="/" aria-label="StitchTrack home"><span className="brand-mark" aria-hidden="true">ST</span>StitchTrack</a><LegalDocumentsDialog terms={terms} privacy={privacy}/></footer>
  </>;
}
