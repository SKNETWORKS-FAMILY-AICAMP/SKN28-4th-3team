import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/api";

export default function Signup() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    if (!form.username.trim() || !form.email.trim() || !form.password.trim()) {
      alert("아이디, 이메일, 비밀번호를 모두 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/api/accounts/signup/", form);

      alert("회원가입이 완료되었습니다. 로그인 화면으로 이동합니다.");
      navigate("/");
    } catch (error) {
      const message = error.response?.data?.error || "회원가입에 실패했습니다.";
      alert(message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="hero-card">
        <span className="badge">Step 1</span>
        <h1>먼저 계정을 만들어주세요</h1>
        <p>
          회원가입 후 건강정보를 등록하면, 의약품 질문에 개인 건강정보를 반영한
          답변을 받을 수 있습니다.
        </p>
      </div>

      <div className="card auth-card">
        <h2>회원가입</h2>
        <p className="sub-text">서비스 이용을 위한 계정을 생성합니다.</p>

        <form onSubmit={handleSignup}>
          <label>아이디</label>
          <input
            name="username"
            placeholder="아이디"
            value={form.username}
            onChange={handleChange}
            required
          />

          <label>이메일</label>
          <input
            name="email"
            type="email"
            placeholder="이메일"
            value={form.email}
            onChange={handleChange}
            required
          />

          <label>비밀번호</label>
          <input
            name="password"
            type="password"
            placeholder="비밀번호"
            value={form.password}
            onChange={handleChange}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className="bottom-text">
          이미 계정이 있나요? <Link to="/">로그인하기</Link>
        </p>
      </div>
    </div>
  );
}