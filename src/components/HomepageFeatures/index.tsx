import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

type BookItem = {
  title: string;
  link: string;
  description: ReactNode;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  isExternal?: boolean;
};

const BookList: BookItem[] = [
  {
    title: 'Docusaurus入门教程',
    link: '/docs/intro',
    description: (
      <>
        从零开始学习 Docusaurus，掌握静态网站生成器的核心概念和实用技巧。
        包含环境搭建、基础配置、内容管理等完整教程。
      </>
    ),
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
  },
  {
    title: 'Tailwind CSS教程',
    link: '/tailwindcss/index.html',
    description: (
      <>
        深入学习 Tailwind CSS 实用优先的 CSS 框架，掌握响应式设计和现代 UI 开发技巧。
        从基础到高级，包含实战项目案例。
      </>
    ),
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    isExternal: true,
  },
];

function Book({title, link, description, Svg, isExternal}: BookItem) {
  const BookContent = () => (
    <div>
      <div className="text--center">
        <Svg className={styles.bookSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className={clsx('col col--6', styles.bookLink)}>
        <BookContent />
      </a>
    );
  }

  return (
    <Link to={link} className={clsx('col col--6', styles.bookLink)}>
      <BookContent />
    </Link>
  );
}

export default function HomepageBooks(): ReactNode {
  return (
    <section className={styles.books}>
      <div className="container">
        <div className="row">
          {BookList.map((props, idx) => (
            <Book key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
