from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import LoginSerializer, UserSerializer


@method_decorator(never_cache, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        # DRF's normal session check skips anonymous callers. Login must check
        # CSRF even before a session exists to prevent login CSRF.
        SessionAuthentication().enforce_csrf(request)
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.sign_in(request, serializer.validated_data)
        return Response({"user": UserSerializer(user).data})


@method_decorator(never_cache, name="dispatch")
@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"user": None})
        return Response({"user": UserSerializer(services.current_user(request.user)).data})


@method_decorator(never_cache, name="dispatch")
class LogoutView(APIView):
    def post(self, request):
        services.sign_out(request)
        return Response(status=204)
