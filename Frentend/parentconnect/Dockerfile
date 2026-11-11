# Production Nginx image serving pre-built Angular artifacts
FROM parentconnect-frontend:latest

# Copy pre-compiled production build directly from dist
COPY dist/parentconnect/browser/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
