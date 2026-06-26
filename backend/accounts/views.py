from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["POST"])
def signup(request):
    username = request.data.get("username", "").strip()
    email = request.data.get("email", "").strip()
    password = request.data.get("password", "").strip()

    if not username or not email or not password:
        return Response(
            {"error": "아이디, 이메일, 비밀번호를 모두 입력해주세요."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"error": "이미 존재하는 아이디입니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {"error": "이미 사용 중인 이메일입니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
    )

    return Response(
        {
            "message": "회원가입이 완료되었습니다.",
            "user_id": user.id,
        },
        status=status.HTTP_201_CREATED,
    )