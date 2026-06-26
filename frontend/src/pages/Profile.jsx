import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/api";

export default function Profile() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    age: "",
    gender: "FEMALE",
    height: "",
    weight: "",
    blood_type: "UNKNOWN",
    pregnancy_status: "NONE",
    allergies: "없음",
    diseases: "없음",
    current_medications: "없음",
  });

  const [isExistingProfile, setIsExistingProfile] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const fetchProfile = async () => {
    try {
      const response = await api.get("/api/profile/");

      setForm({
        age: response.data.age || "",
        gender: response.data.gender || "FEMALE",
        height: response.data.height || "",
        weight: response.data.weight || "",
        blood_type: response.data.blood_type || "UNKNOWN",
        pregnancy_status: response.data.pregnancy_status || "NONE",
        allergies: response.data.allergies || "없음",
        diseases: response.data.diseases || "없음",
        current_medications: response.data.current_medications || "없음",
      });

      setIsExistingProfile(true);
    } catch {
      setIsExistingProfile(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...form,
      age: Number(form.age),
      height: Number(form.height),
      weight: Number(form.weight),
    };

    try {
      if (isExistingProfile) {
        await api.put("/api/profile/", payload);
        alert("건강정보 수정 완료! AI 상담 화면으로 이동합니다.");
      } else {
        await api.post("/api/profile/", payload);
        alert("건강정보 저장 완료! AI 상담 화면으로 이동합니다.");
        setIsExistingProfile(true);
      }

      navigate("/chat");
    } catch (error) {
      alert("건강정보 저장에 실패했습니다.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <div className="page">
      <div className="wide-card">
        <div className="section-header">
          <span className="badge">Step 2</span>
          <h1>건강 프로필 등록</h1>
          <p>
            입력한 건강정보는 의약품 상담 답변의 개인화 요소로 사용됩니다.
          </p>
        </div>

        <form onSubmit={handleSave} className="profile-form">
          <div className="form-grid">
            <div>
              <label>나이</label>
              <input
                name="age"
                type="number"
                placeholder="예: 24"
                value={form.age}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>성별</label>
              <select name="gender" value={form.gender} onChange={handleChange}>
                <option value="FEMALE">여성</option>
                <option value="MALE">남성</option>
                <option value="OTHER">기타</option>
              </select>
            </div>

            <div>
              <label>키(cm)</label>
              <input
                name="height"
                type="number"
                step="0.1"
                placeholder="예: 162.5"
                value={form.height}
                onChange={handleChange}
              />
            </div>

            <div>
              <label>체중(kg)</label>
              <input
                name="weight"
                type="number"
                step="0.1"
                placeholder="예: 52"
                value={form.weight}
                onChange={handleChange}
              />
            </div>

            <div>
              <label>혈액형</label>
              <select
                name="blood_type"
                value={form.blood_type}
                onChange={handleChange}
              >
                <option value="UNKNOWN">혈액형 미입력</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>

            <div>
              <label>임신/수유 여부</label>
              <select
                name="pregnancy_status"
                value={form.pregnancy_status}
                onChange={handleChange}
              >
                <option value="NONE">해당 없음</option>
                <option value="PREGNANT">임신 중</option>
                <option value="BREASTFEEDING">수유 중</option>
              </select>
            </div>

            <div>
              <label>알레르기</label>
              <select
                name="allergies"
                value={form.allergies}
                onChange={handleChange}
              >
                <option value="없음">알레르기 없음</option>
                <option value="페니실린 계열">페니실린 계열</option>
                <option value="세팔로스포린 계열">세팔로스포린 계열</option>
                <option value="아스피린">아스피린</option>
                <option value="이부프로펜/NSAIDs">이부프로펜/NSAIDs</option>
                <option value="설파제">설파제</option>
                <option value="조영제">조영제</option>
                <option value="음식 알레르기">음식 알레르기</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div>
              <label>기저질환</label>
              <select
                name="diseases"
                value={form.diseases}
                onChange={handleChange}
              >
                <option value="없음">기저질환 없음</option>
                <option value="간 질환">간 질환</option>
                <option value="신장 질환">신장 질환</option>
                <option value="고혈압">고혈압</option>
                <option value="당뇨">당뇨</option>
                <option value="천식">천식</option>
                <option value="위염/위궤양">위염/위궤양</option>
                <option value="심혈관 질환">심혈관 질환</option>
                <option value="갑상선 질환">갑상선 질환</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="full">
              <label>복용 중인 약물</label>
              <select
                name="current_medications"
                value={form.current_medications}
                onChange={handleChange}
              >
                <option value="없음">복용 중인 약물 없음</option>
                <option value="진통제">진통제</option>
                <option value="감기약">감기약</option>
                <option value="항생제">항생제</option>
                <option value="혈압약">혈압약</option>
                <option value="당뇨약">당뇨약</option>
                <option value="위장약">위장약</option>
                <option value="항응고제/혈전약">항응고제/혈전약</option>
                <option value="수면제/진정제">수면제/진정제</option>
                <option value="우울증약">우울증약</option>
                <option value="피임약">피임약</option>
                <option value="영양제">영양제</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={loading}>
            {loading
              ? "저장 중..."
              : isExistingProfile
              ? "수정 후 AI 상담하기"
              : "저장 후 AI 상담하기"}
          </button>
        </form>
      </div>
    </div>
  );
}