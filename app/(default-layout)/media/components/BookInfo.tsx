import React, { useEffect, useState } from 'react';
import styles from './BookInfo.module.css';

interface BookInfoListProps {
  isbns: string[];
}

interface BookData {
  title: string;
  authors: string[];
  cover: string;
  isbn: string;
}

const BookInfoList: React.FC<BookInfoListProps> = ({ isbns }) => {
  const [booksData, setBooksData] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const book404 = ("/images/Book404.png");

  useEffect(() => {
    const fetchBookData = async () => {
      try {
        const booksPromises = isbns.map(async (isbn) => {
          const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
          const data = await response.json();
          if (data[`ISBN:${isbn}`]) {
            const book = data[`ISBN:${isbn}`];
            const authors = book.authors.map((author: { name: string }) => author.name);
            return {
              title: book.title,
              authors: authors,
              cover: book.cover ? book.cover.large : book404,
              isbn
            };
          } else {
            return null;
          }
        });

        const booksResults = await Promise.all(booksPromises);
        const validBooks = booksResults.filter((book) => book !== null) as BookData[];
        setBooksData(validBooks);
      } catch (err) {
        setError('Error fetching book data. It\'s quite likely that the cause of this error is from OpenLibrary being temporarily offline either for maintenance or as a result of an ongoing legal battle :/');
      } finally {
        setLoading(false);
      }
    };

    fetchBookData();
  }, [isbns]);

  if (loading) {
    return <div className={styles.status}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.status}>{error}</div>;
  }

  return (
    <div className={styles.main}>
      {booksData.map((book) => (
        <div key={book.isbn} className={styles.book}>
          {book.cover && <a href={`https://www.amazon.com/s?k=${book.isbn}`} target="_blank" rel="noopener noreferrer"><img src={book.cover} alt={`${book.title} cover`} style={{ width: '100%', marginBottom: '16px' }} /></a>}
          <h2>{book.title}</h2>
          <p>By {book.authors.join(', ')}</p>
          <a className={styles.Buy} href={`https://www.amazon.com/s?k=${book.isbn}`} target="_blank" rel="noopener noreferrer">Buy on Amazon</a>
        </div>
      ))}
      <div className={styles.Spacer}></div>
    </div>
  );
};

export default BookInfoList;
