#include "httplib.h"
#include "server.h"
#include <iostream>

int main() {
    httplib::Server svr;

    svr.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
        if (req.method == "OPTIONS") {
            res.status = 204;
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    registerRoutes(svr);

    std::cout << "NBA backend running on http://localhost:8080\n";
    std::cout << "Endpoints: GET /games  /game/:id  /probability/:id  /health\n";

    if (!svr.listen("0.0.0.0", 8080)) {
        std::cerr << "Failed to start server on port 8080\n";
        return 1;
    }

    return 0;
}
