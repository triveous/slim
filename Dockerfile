# Stage 1: Build the React application
FROM node:18-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package.json and yarn.lock to leverage Docker cache
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Create the production build
# Using the command from your README
RUN PUBLIC_URL=/ yarn build

# Stage 2: Serve the application using a lightweight web server
FROM nginx:1.25-alpine

# Copy the build output from the build stage to the Nginx html directory
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80 to the outside world
EXPOSE 80

# Command to run Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
