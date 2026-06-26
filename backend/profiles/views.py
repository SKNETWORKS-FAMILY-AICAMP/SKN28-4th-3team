from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import HealthProfile
from .serializers import HealthProfileSerializer


@api_view(["GET", "POST", "PUT"])
@permission_classes([IsAuthenticated])
def health_profile(request):
    user = request.user

    if request.method == "GET":
        try:
            profile = HealthProfile.objects.get(user=user)
            serializer = HealthProfileSerializer(profile)
            return Response(serializer.data)
        except HealthProfile.DoesNotExist:
            return Response(
                {"error": "건강정보가 등록되어 있지 않습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

    if request.method == "POST":
        if HealthProfile.objects.filter(user=user).exists():
            return Response(
                {"error": "이미 건강정보가 등록되어 있습니다. 수정 기능을 이용해주세요."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = HealthProfileSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(user=user)
            return Response(
                {
                    "message": "건강정보가 저장되었습니다.",
                    "profile": serializer.data,
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if request.method == "PUT":
        try:
            profile = HealthProfile.objects.get(user=user)
        except HealthProfile.DoesNotExist:
            return Response(
                {"error": "수정할 건강정보가 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = HealthProfileSerializer(profile, data=request.data)

        if serializer.is_valid():
            serializer.save()
            return Response(
                {
                    "message": "건강정보가 수정되었습니다.",
                    "profile": serializer.data,
                }
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)