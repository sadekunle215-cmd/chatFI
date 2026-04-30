import { useState } from "react";
import { T } from "../../constants";
import { BLOG_POSTS } from "../../constants/blogPosts";
import { SvgClose, SvgBlog } from "../icons/Icons";

// ── BlogPanel ──────────────────────────────────────────────────────────────────
export default function BlogPanel({ show, onClose }) {
  const [selected, setSelected] = useState(null);

  if (!show) return null;
  const post = selected != null ? BLOG_POSTS.find(p => p.id === selected) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 920,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        width: "100%", maxWidth: 520,
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: "16px 16px 0 0", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {post && (
              <button onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 18, marginRight: 4, padding: 0 }}>‹</button>
            )}
            <SvgBlog size={16} color={T.text3} />
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text1 }}>
              {post ? post.title : "Guides & Help"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2 }}>
            <SvgClose size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
          {!post
            ? <PostList posts={BLOG_POSTS} onSelect={setSelected} />
            : <PostDetail post={post} />
          }
        </div>
      </div>
    </div>
  );
}

function PostList({ posts, onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {posts.map(p => (
        <button key={p.id} onClick={() => onSelect(p.id)}
          style={{
            width: "100%", textAlign: "left", padding: "14px 16px",
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 12, cursor: "pointer", transition: "border-color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, padding: "2px 7px", background: T.accentBg, border: `1px solid ${T.accent}33`, borderRadius: 20, color: T.accent }}>
              {p.category}
            </span>
            <span style={{ fontSize: 10, color: T.text3 }}>{p.readTime}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>{p.title}</div>
          <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.5 }}>{p.summary}</div>
        </button>
      ))}
    </div>
  );
}

function PostDetail({ post }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 10, padding: "2px 7px", background: T.accentBg, border: `1px solid ${T.accent}33`, borderRadius: 20, color: T.accent }}>{post.category}</span>
          <span style={{ fontSize: 10, color: T.text3 }}>{post.readTime} · {post.date}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, lineHeight: 1.4 }}>{post.title}</div>
        <div style={{ fontSize: 13, color: T.text3, marginTop: 8, lineHeight: 1.6 }}>{post.summary}</div>
      </div>

      {post.sections?.map((s, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 6 }}>{s.heading}</div>
          <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.65 }}>{s.body}</div>
        </div>
      ))}

      {post.tips?.length > 0 && (
        <div style={{ padding: 14, background: T.accentBg, border: `1px solid ${T.accent}33`, borderRadius: 10, marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 8 }}>💡 PRO TIPS</div>
          {post.tips.map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: T.text2, marginBottom: 5, paddingLeft: 12, borderLeft: `2px solid ${T.accent}44`, lineHeight: 1.5 }}>
              {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
