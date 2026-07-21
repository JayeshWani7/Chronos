# Build stage
FROM gradle:8-jdk21 AS build

WORKDIR /app

# Copy configuration files
COPY build.gradle settings.gradle /app/

# Download/cache dependencies
RUN gradle build -x test --no-daemon || true

# Copy source files
COPY src /app/src

# Package application jar
RUN gradle bootJar --no-daemon -x test

# Runtime stage
FROM eclipse-temurin:21-jdk

WORKDIR /app

# Copy the packaged jar from build stage
COPY --from=build /app/build/libs/*.jar /app/app.jar

# Run application jar
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
