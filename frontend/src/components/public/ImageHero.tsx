import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './imageHero.module.css';

export interface ImageHeroAction {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
}

export interface ImageHeroProps {
  image: string;
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ImageHeroAction[];
  imagePosition?: string;
  theme?: 'orange' | 'blue' | 'green' | 'violet' | 'teal' | 'rose';
  children?: ReactNode;
}

export default function ImageHero({
  image,
  eyebrow,
  title,
  description,
  actions = [],
  imagePosition = 'center',
  theme = 'orange',
  children,
}: ImageHeroProps) {
  return (
    <section className={`${styles.hero} ${styles[theme]}`}>
      <div className={styles.photo} style={{ backgroundImage: `url(${image})`, backgroundPosition: imagePosition }} aria-hidden="true" />
      <div className={styles.wash} aria-hidden="true" />
      <div className={styles.content}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={action.variant === 'secondary' ? styles.secondary : styles.primary}
              >
                {action.label} <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
