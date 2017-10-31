FROM hltcoe/concrete-python:4.14.0

RUN mkdir /home/concrete/simple-search
WORKDIR /home/concrete/simple-search

COPY search-http-server.py /home/concrete/simple-search
COPY ui /home/concrete/simple-search/ui

EXPOSE 8080

ENTRYPOINT ["python", "search-http-server.py"]

CMD ["--help"]
