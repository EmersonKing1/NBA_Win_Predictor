cmake_minimum_required(VERSION 3.21)
project(nbapred VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(cpr CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)

add_executable(nbapred_server
    backend/src/main.cpp
    backend/src/server.cpp
    backend/src/nba_client.cpp
    backend/src/probability.cpp
)

target_include_directories(nbapred_server PRIVATE
    backend/vendor
    backend/src
)

target_link_libraries(nbapred_server PRIVATE
    cpr::cpr
    nlohmann_json::nlohmann_json
    OpenSSL::SSL
    OpenSSL::Crypto
)

if(WIN32)
    target_link_libraries(nbapred_server PRIVATE ws2_32 crypt32)
endif()

target_compile_definitions(nbapred_server PRIVATE CPPHTTPLIB_OPENSSL_SUPPORT)
