FROM debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential cmake git curl zip unzip tar pkg-config \
    libssl-dev libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install vcpkg
RUN git clone https://github.com/microsoft/vcpkg.git /vcpkg && \
    /vcpkg/bootstrap-vcpkg.sh -disableMetrics

ENV VCPKG_ROOT=/vcpkg

WORKDIR /app
COPY vcpkg.json .
COPY CMakeLists.txt .
COPY backend/ backend/

# Build
RUN cmake -B build -S . \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TOOLCHAIN_FILE=/vcpkg/scripts/buildsystems/vcpkg.cmake \
    -DVCPKG_TARGET_TRIPLET=x64-linux && \
    cmake --build build --config Release -j$(nproc)

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 libcurl4 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/build/nbapred_server /usr/local/bin/nbapred_server

EXPOSE 8080
CMD ["nbapred_server"]
