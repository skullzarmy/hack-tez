import { Routes, Route, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";

const WikiHome = lazy(() => import("../components/wiki/WikiHome"));
const ArticleView = lazy(() => import("../components/wiki/ArticleView"));
const ArticleEditor = lazy(() => import("../components/wiki/ArticleEditor"));
const ArticleHistory = lazy(() => import("../components/wiki/ArticleHistory"));
const WikiSearch = lazy(() => import("../components/wiki/WikiSearch"));
const ModDashboard = lazy(() => import("../components/wiki/ModDashboard"));
const AdminPanel = lazy(() => import("../components/wiki/AdminPanel"));
const CategoryView = lazy(() => import("../components/wiki/CategoryView"));
const ArticleRevisionView = lazy(() => import("../components/wiki/ArticleRevisionView"));

function ArticleViewRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <ArticleView slug={slug ?? ""} />;
}

function ArticleEditRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <ArticleEditor slug={slug} />;
}

function ArticleHistoryRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <ArticleHistory slug={slug ?? ""} />;
}

function ArticleRevisionRoute() {
  const { slug, rev } = useParams<{ slug: string; rev: string }>();
  return <ArticleRevisionView slug={slug ?? ""} revision={rev ?? ""} />;
}

function CategoryViewRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <CategoryView slug={slug ?? ""} />;
}

/**
 * WikiApp — sub-router for /wiki/* routes.
 */
export default function WikiApp() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<WikiHome />} />
        <Route path="/new" element={<ArticleEditor />} />
        <Route path="/search" element={<WikiSearch />} />
        <Route path="/mod" element={<ModDashboard />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/categories/:slug" element={<CategoryViewRoute />} />
        <Route path="/:slug/edit" element={<ArticleEditRoute />} />
        <Route path="/:slug/history" element={<ArticleHistoryRoute />} />
        <Route path="/:slug/revisions/:rev" element={<ArticleRevisionRoute />} />
        <Route path="/:slug" element={<ArticleViewRoute />} />
        <Route path="*" element={<WikiHome />} />
      </Routes>
    </Suspense>
  );
}
