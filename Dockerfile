# Stage 1: Build the React application
# Use a newer version of Node.js that meets dependency requirements
FROM node:20-alpine AS build

# Set the working directory
WORKDIR /app

# This ARG will receive the value from the GitHub Actions workflow
ARG REACT_APP_CONFIG
# This ENV makes the variable available to the yarn build script
ENV REACT_APP_CONFIG=${REACT_APP_CONFIG}
# Copy package.json and yarn.lock to leverage Docker cache
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Create the production build
RUN PUBLIC_URL=/slim/ yarn build

# Stage 2: Serve the application using a lightweight web server
FROM nginx:1.25-alpine

# Copy your new custom Nginx config into the image
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the build output from the build stage to the Nginx html directory
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80 to the outside world
EXPOSE 80

# Command to run Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
